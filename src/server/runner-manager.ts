import type { Msg, NatsConnection, Subscription } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import {
  runnerCmdSubject,
  runnerHeartbeatSubject,
  RUNNER_REGISTRY_BUCKET,
  isProtocolSupported,
  runnerLivenessState,
  SUPPORTED_RANGE,
  type RunnerCapabilities,
  type RunnerHeartbeat,
  type RunnerLivenessState,
  type RunnerRegistration,
} from "../shared/runner-protocol"
import { LOG_PREFIX } from "../shared/branding"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface RunnerManagerOptions {
  nc: NatsConnection
  natsUrl: string
  authToken?: string
  /**
   * Called in callout mode to mint a scoped credential token for the given
   * runnerId just before the runner process is spawned. When provided, it takes
   * precedence over authToken for the spawned runner's NATS_TOKEN env var.
   */
  mintToken?: (runnerId: string) => Promise<string>
  /** 'spawn' (default): spawn runner if not found. 'discover': only discover existing runner from KV. */
  mode?: "spawn" | "discover"
}

export interface RunnerReadiness {
  ok: boolean
  runnerId: string | null
  pid: number | null
  registered: boolean
  /** Derived liveness state from server-tracked lastHeartbeatAt. */
  state: RunnerLivenessState
  /** heartbeatFresh === (state === "online") — kept for back-compat. */
  heartbeatFresh: boolean
  lastHeartbeatAt: number | null
  /** Protocol version reported by the runner registration, or null if not registered. */
  protocolVersion: number | null
  /** True when the runner's protocolVersion is outside the server's SUPPORTED_RANGE. */
  incompatible: boolean
  /** Capabilities advertised by the runner at registration time. Null if not yet registered. */
  capabilities: RunnerCapabilities | null
}

export class RunnerManager {
  private readonly nc: NatsConnection
  private readonly natsUrl: string
  private readonly authToken: string | undefined
  private readonly mintToken: ((runnerId: string) => Promise<string>) | undefined
  private readonly mode: "spawn" | "discover"
  private proc: ReturnType<typeof Bun.spawn> | null = null
  private runnerId: string | null = null
  private runnerRegistration: RunnerRegistration | null = null
  private lastHeartbeatAt: number | null = null
  private heartbeatSubscription: Subscription | null = null

  constructor(options: RunnerManagerOptions) {
    this.nc = options.nc
    this.natsUrl = options.natsUrl
    this.authToken = options.authToken
    this.mintToken = options.mintToken
    this.mode = options.mode ?? "spawn"
  }

  getRunnerId(): string {
    if (!this.runnerId) throw new Error("Runner not started")
    return this.runnerId
  }

  getReadiness(now = Date.now()): RunnerReadiness {
    const state = runnerLivenessState(this.lastHeartbeatAt, now)
    const heartbeatFresh = state === "online"
    const registered = this.runnerRegistration !== null
    // A registration missing protocolVersion is treated as incompatible (defensive).
    const protocolVersion = this.runnerRegistration?.protocolVersion ?? null
    const incompatible =
      protocolVersion === null
        ? registered // if registered but no version field, it's incompatible
        : !isProtocolSupported(protocolVersion)
    const capabilities = this.runnerRegistration?.capabilities ?? null
    return {
      ok: this.runnerId !== null && registered && heartbeatFresh && !incompatible,
      runnerId: this.runnerId,
      pid: this.runnerRegistration?.pid ?? this.proc?.pid ?? null,
      registered,
      state,
      heartbeatFresh,
      lastHeartbeatAt: this.lastHeartbeatAt,
      protocolVersion,
      incompatible,
      capabilities,
    }
  }

  async ensureRunner(): Promise<string> {
    // Check if runner already exists in KV and is alive
    if (this.runnerId) {
      try {
        const kvm = new Kvm(this.nc)
        const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        const entry = await kvStore.get(this.runnerId)
        if (entry) {
          const reg = JSON.parse(decoder.decode(entry.value)) as RunnerRegistration
          this.runnerRegistration = reg
          // For the active (spawn-mode) runner, prefer the server-tracked
          // lastHeartbeatAt for liveness rather than lastSeenAt from KV.
          // If we have live heartbeat data, use that; otherwise fall back to lastSeenAt.
          const freshnessSrc = this.lastHeartbeatAt ?? reg.lastSeenAt ?? null
          if (runnerLivenessState(freshnessSrc, Date.now()) !== "offline") {
            return this.runnerId
          }
          // Runner offline — fall through to respawn or discover
        }
      } catch {
        // KV bucket might not exist yet, proceed to spawn or discover
      }
    }

    if (this.mode === "discover") {
      return this.discoverExternalRunner()
    }

    // Spawn new runner
    const runnerId = `runner-${Date.now()}-${process.pid}`
    const runnerScript = new URL("../runner/runner.ts", import.meta.url).pathname

    // In callout mode mintToken produces a scoped credential for this runnerId.
    // In token mode authToken is the shared static token — behaviour unchanged.
    const runnerToken = this.mintToken
      ? await this.mintToken(runnerId)
      : this.authToken

    this.subscribeToHeartbeat(runnerId)

    this.proc = Bun.spawn(["bun", "run", runnerScript], {
      env: {
        ...process.env,
        NATS_URL: this.natsUrl,
        ...(runnerToken ? { NATS_TOKEN: runnerToken } : {}),
        RUNNER_ID: runnerId,
      },
      stdio: ["ignore", "inherit", "inherit"],
    })

    this.runnerId = runnerId

    // Wait for runner to register in KV
    await this.waitForRegistration(runnerId, 15_000)
    await this.waitForHeartbeat(5_000)

    const { incompatible, protocolVersion } = this.getReadiness()
    if (incompatible) {
      console.warn(
        LOG_PREFIX,
        `Runner ${runnerId} is incompatible (protocol v${protocolVersion ?? "unknown"}, server supports v${SUPPORTED_RANGE.min}–${SUPPORTED_RANGE.max})`,
      )
    }
    console.warn(LOG_PREFIX, `Runner ${runnerId} spawned (pid: ${this.proc.pid})`)

    return runnerId
  }

  private async waitForRegistration(runnerId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    const kvm = new Kvm(this.nc)
    let kvStore: Awaited<ReturnType<typeof kvm.open>> | null = null
    while (Date.now() < deadline) {
      try {
        if (!kvStore) kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        const entry = await kvStore.get(runnerId)
        if (entry) {
          this.runnerRegistration = JSON.parse(decoder.decode(entry.value)) as RunnerRegistration
          return
        }
      } catch {
        kvStore = null // KV not ready yet, retry open next iteration
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`Runner ${runnerId} did not register within ${timeoutMs}ms`)
  }

  private subscribeToHeartbeat(runnerId: string): void {
    this.heartbeatSubscription?.unsubscribe()
    this.lastHeartbeatAt = null
    const sub = this.nc.subscribe(runnerHeartbeatSubject(runnerId))
    this.heartbeatSubscription = sub
    void this.consumeHeartbeats(sub, runnerId)
  }

  private async consumeHeartbeats(sub: Subscription, runnerId: string): Promise<void> {
    for await (const msg of sub) {
      if (sub !== this.heartbeatSubscription || runnerId !== this.runnerId) {
        continue
      }
      this.recordHeartbeat(msg)
    }
  }

  private recordHeartbeat(msg: Msg): void {
    try {
      const heartbeat = JSON.parse(decoder.decode(msg.data)) as RunnerHeartbeat
      if (heartbeat.runnerId !== this.runnerId) return
      this.lastHeartbeatAt = heartbeat.ts
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `Runner heartbeat decode failed: ${message}`)
    }
  }

  private async waitForHeartbeat(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.getReadiness().heartbeatFresh) return
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`Runner ${this.runnerId ?? "unknown"} did not publish heartbeat within ${timeoutMs}ms`)
  }

  /** Discover mode: poll KV for any registered runner instead of spawning one. */
  private async discoverExternalRunner(): Promise<string> {
    const deadline = Date.now() + 15_000
    const kvm = new Kvm(this.nc)
    while (Date.now() < deadline) {
      try {
        const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        const keys = await kvStore.keys()
        for await (const key of keys) {
          const entry = await kvStore.get(key)
          if (!entry) continue
          const reg = JSON.parse(decoder.decode(entry.value)) as RunnerRegistration
          const livenessNow = Date.now()
          // Use KV lastSeenAt for discovery liveness — pid is meaningless for
          // cross-machine runners. Skip any candidate that is offline.
          if (runnerLivenessState(reg.lastSeenAt ?? null, livenessNow) === "offline") {
            continue
          }
          // Skip incompatible runners — adopting one would block every turn start.
          // `?? -1` guards pre-PR3 KV entries that lack protocolVersion (would be
          // undefined at runtime despite the typed field) → treated as incompatible.
          if (!isProtocolSupported(reg.protocolVersion ?? -1)) {
            console.warn(
              LOG_PREFIX,
              `Discover: skipping incompatible runner ${key} (protocol v${reg.protocolVersion}, server supports v${SUPPORTED_RANGE.min}–${SUPPORTED_RANGE.max})`,
            )
            continue
          }
          this.runnerId = key
          this.runnerRegistration = reg
          this.subscribeToHeartbeat(key)
          await this.waitForHeartbeat(5_000)
          console.warn(LOG_PREFIX, `Discovered external runner ${key} (pid: ${reg.pid})`)
          return key
        }
      } catch {
        // KV not ready yet
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error("No external runner found in KV registry within 15s — is kanna-runner.service running?")
  }

  async dispose(): Promise<void> {
    this.heartbeatSubscription?.unsubscribe()
    this.heartbeatSubscription = null
    if (this.mode === "discover") {
      // External runner — don't kill it, just disconnect
      this.runnerId = null
      this.runnerRegistration = null
      this.lastHeartbeatAt = null
      console.warn(LOG_PREFIX, "Runner manager disposed (external runner left running)")
      return
    }
    if (this.runnerId && this.proc) {
      // Try graceful shutdown via NATS command, then SIGTERM as fallback
      try {
        await this.nc.request(
          runnerCmdSubject(this.runnerId, "shutdown"),
          encoder.encode(JSON.stringify({ reason: "server shutdown" })),
          { timeout: 3000 },
        )
      } catch {
        // NATS request failed or timed out
      }

      // Always send SIGTERM — the NATS shutdown command only cleans up
      // subscriptions but doesn't exit the process
      try {
        this.proc.kill("SIGTERM")
      } catch {
        // Process may already be gone
      }
    }

    if (this.proc) {
      await this.proc.exited
      this.proc = null
    }

    this.runnerId = null
    this.runnerRegistration = null
    this.lastHeartbeatAt = null
    console.warn(LOG_PREFIX, "Runner manager disposed")
  }
}

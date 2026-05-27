import { connect, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import { spawnSync } from "node:child_process"
import { LOG_PREFIX } from "../shared/branding"
import {
  runnerCmdSubject,
  runnerHeartbeatSubject,
  RUNNER_REGISTRY_BUCKET,
  PROTOCOL_VERSION,
  type RunnerCapabilities,
  type StartTurnCommand,
  type CancelTurnCommand,
  type RespondToolCommand,
  type StopChatPtyCommand,
  type RunnerRegistration,
  type RunnerHeartbeat,
} from "../shared/runner-protocol"
import type { AgentProvider } from "../shared/types"
import { resolveClaudeBinary } from "../server/claude-pty/resolve-binary.adapter"
import type { RunnerAgent } from "./runner-agent"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const RUNNER_RECONNECT_OPTIONS = {
  maxReconnectAttempts: -1,
  reconnectTimeWait: 750,
  pingInterval: 15_000,
  maxPingOut: 3,
} as const

export interface ConnectRunnerOptions {
  natsUrl: string
  token?: string | undefined
  connectFn?: typeof connect
}

export async function connectRunner(
  options: ConnectRunnerOptions,
): Promise<NatsConnection> {
  const { natsUrl, token, connectFn = connect } = options
  return connectFn({
    servers: natsUrl,
    ...(token ? { token } : {}),
    ...RUNNER_RECONNECT_OPTIONS,
  })
}

export interface ShutdownConnectionOptions {
  drainTimeoutMs?: number
}

export async function shutdownConnection(
  nc: NatsConnection,
  options: ShutdownConnectionOptions = {},
): Promise<void> {
  const drainTimeoutMs = options.drainTimeoutMs ?? 3_000
  try {
    await Promise.race([
      nc.drain(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("drain timeout")), drainTimeoutMs),
      ),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(LOG_PREFIX, `runner drain timeout or failed: ${message} — falling back to close()`)
    await nc.close().catch((closeError) => {
      const closeMessage = closeError instanceof Error ? closeError.message : String(closeError)
      console.warn(LOG_PREFIX, `runner close() also failed: ${closeMessage}`)
    })
  }
}

/**
 * Probe which agent providers are actually installed on this runner.
 * A provider is present if its binary resolves successfully. Errors are caught
 * and treated as "not installed" so a bad probe never crashes registration.
 *
 * Exported for testing only — callers within this module use `probeProviders()`.
 */
export async function probeProviders(
  _resolveClaudeBinary?: typeof resolveClaudeBinary,
): Promise<RunnerCapabilities> {
  const resolver = _resolveClaudeBinary ?? resolveClaudeBinary
  const providers: AgentProvider[] = []

  // Probe claude (SDK provider)
  try {
    await resolver({ env: process.env, homeDir: process.env.HOME ?? process.env.USERPROFILE ?? "" })
    providers.push("claude")
    // claude-pty is the same claude binary driven through a PTY (the
    // claude-pty driver) rather than the SDK. It has no separate binary, so
    // if claude resolves, claude-pty is available too. Advertise it explicitly
    // — otherwise the server's capability gate refuses every claude-pty turn.
    providers.push("claude-pty")
  } catch {
    // claude binary not found — exclude claude and claude-pty from capabilities
  }

  // Probe codex via which (mirrors resolveCodexBinary in turn-factories.ts)
  try {
    const which = spawnSync("which", ["codex"], { encoding: "utf-8", timeout: 3000 })
    if (which.status === 0 && which.stdout.trim()) {
      providers.push("codex")
    }
  } catch {
    // which failed — exclude codex
  }

  console.warn(LOG_PREFIX, `Probed capabilities: providers=[${providers.join(", ")}]`)
  return { providers }
}

export interface RunnerNatsHandlerOptions {
  nc: NatsConnection
  agent: RunnerAgent
  runnerId: string
  heartbeatIntervalMs?: number
  /** Override the capability probe for testing — if provided, skips the real probe. */
  _probeProviders?: () => Promise<RunnerCapabilities>
}

export class RunnerNatsHandler {
  private readonly nc: NatsConnection
  private readonly agent: RunnerAgent
  private readonly runnerId: string
  private readonly heartbeatIntervalMs: number
  private readonly _probeProviders: () => Promise<RunnerCapabilities>
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private subscriptions: Subscription[] = []
  // Cache the registration shape so heartbeats can update lastSeenAt without
  // re-constructing the full object each time.
  private registration: RunnerRegistration | null = null
  // Cached KV handle for the registry bucket — reused across heartbeat
  // lastSeenAt writes instead of re-opening (kvm.open) on every beat.
  private registryKv: Awaited<ReturnType<Kvm["open"]>> | null = null

  constructor(options: RunnerNatsHandlerOptions) {
    this.nc = options.nc
    this.agent = options.agent
    this.runnerId = options.runnerId
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000
    this._probeProviders = options._probeProviders ?? probeProviders
  }

  async start(): Promise<void> {
    // Register in KV
    await this.register()

    // Subscribe to commands
    this.subscribeCommand("start_turn", async (data) => {
      const cmd = JSON.parse(data) as StartTurnCommand
      await this.agent.startTurn(cmd)
    })

    this.subscribeCommand("cancel_turn", async (data) => {
      const cmd = JSON.parse(data) as CancelTurnCommand
      await this.agent.cancel(cmd.chatId)
    })

    this.subscribeCommand("respond_tool", async (data) => {
      const cmd = JSON.parse(data) as RespondToolCommand
      await this.agent.respondTool(cmd.chatId, cmd.toolUseId, cmd.result)
    })

    this.subscribeCommand("stop_chat_pty", async (data) => {
      const cmd = JSON.parse(data) as StopChatPtyCommand
      this.agent.stopChatPty(cmd.chatId)
    })

    this.subscribeCommand("shutdown", async () => {
      this.dispose()
    })

    // Flush to ensure subscriptions are visible to other connections
    await this.nc.flush()

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => this.publishHeartbeat(), this.heartbeatIntervalMs)
    this.publishHeartbeat()
  }

  dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
    this.subscriptions = []
  }

  private subscribeCommand(cmd: string, handler: (data: string) => Promise<void>): void {
    const subject = runnerCmdSubject(this.runnerId, cmd)
    const sub = this.nc.subscribe(subject)
    this.subscriptions.push(sub)

    void (async () => {
      for await (const msg of sub) {
        try {
          const data = decoder.decode(msg.data)
          await handler(data)
          msg.respond(encoder.encode(JSON.stringify({ ok: true })))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(LOG_PREFIX, `Runner command ${cmd} failed: ${message}`)
          msg.respond(encoder.encode(JSON.stringify({ ok: false, error: message })))
        }
      }
    })()
  }

  private async register(): Promise<void> {
    // Allow tests to simulate a protocol skew via RUNNER_PROTOCOL_VERSION env.
    const protocolVersion = Number(process.env.RUNNER_PROTOCOL_VERSION ?? PROTOCOL_VERSION)

    // Probe installed providers — defensive: a probe error excludes that provider, never crashes.
    let capabilities: RunnerCapabilities
    try {
      capabilities = await this._probeProviders()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(LOG_PREFIX, `Capability probe failed (defaulting to empty): ${message}`)
      capabilities = { providers: [] }
    }

    const registration: RunnerRegistration = {
      runnerId: this.runnerId,
      pid: process.pid,
      startedAt: Date.now(),
      providers: capabilities.providers,
      protocolVersion,
      capabilities,
      lastSeenAt: Date.now(),
    }
    this.registration = registration
    try {
      const kvm = new Kvm(this.nc)
      const kvStore = await kvm.create(RUNNER_REGISTRY_BUCKET, {
        max_bytes: 1024 * 1024,
      })
      this.registryKv = kvStore
      await kvStore.put(this.runnerId, encoder.encode(JSON.stringify(registration)))
    } catch (error) {
      // KV bucket may already exist — try to open instead
      try {
        const kvm = new Kvm(this.nc)
        const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        this.registryKv = kvStore
        await kvStore.put(this.runnerId, encoder.encode(JSON.stringify(registration)))
      } catch (innerError) {
        const message = innerError instanceof Error ? innerError.message : String(innerError)
        console.warn(LOG_PREFIX, `Runner KV registration failed: ${message}`)
      }
    }
  }

  private publishHeartbeat(): void {
    const heartbeat: RunnerHeartbeat = {
      runnerId: this.runnerId,
      activeChatIds: [...this.agent.activeTurns.keys()],
      ts: Date.now(),
    }
    try {
      this.nc.publish(
        runnerHeartbeatSubject(this.runnerId),
        encoder.encode(JSON.stringify(heartbeat))
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `runner heartbeat publish failed: ${message}`)
    }
    // Update lastSeenAt in KV on every heartbeat so the discover path (no live
    // subscription) has a fresh TTL signal. Fire-and-forget; a missed write just
    // means the cached value ages naturally — still bounded by heartbeatIntervalMs.
    this.updateLastSeenAt()
  }

  private updateLastSeenAt(): void {
    if (!this.registration) return
    const updated: RunnerRegistration = { ...this.registration, lastSeenAt: Date.now() }
    this.registration = updated
    void (async () => {
      try {
        // Reuse the cached KV handle from register(); open once if absent.
        if (!this.registryKv) {
          this.registryKv = await new Kvm(this.nc).open(RUNNER_REGISTRY_BUCKET)
        }
        await this.registryKv.put(this.runnerId, encoder.encode(JSON.stringify(updated)))
      } catch {
        // Best-effort; drop the (possibly stale) handle so the next beat re-opens.
        this.registryKv = null
      }
    })()
  }

  /** Test-only wrapper for the private heartbeat publisher. */
  publishHeartbeatForTest(): void {
    this.publishHeartbeat()
  }
}

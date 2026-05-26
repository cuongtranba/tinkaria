import { connect, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import { LOG_PREFIX } from "../shared/branding"
import {
  runnerCmdSubject,
  runnerHeartbeatSubject,
  RUNNER_REGISTRY_BUCKET,
  PROTOCOL_VERSION,
  type StartTurnCommand,
  type CancelTurnCommand,
  type RespondToolCommand,
  type RunnerRegistration,
  type RunnerHeartbeat,
} from "../shared/runner-protocol"
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

export interface RunnerNatsHandlerOptions {
  nc: NatsConnection
  agent: RunnerAgent
  runnerId: string
  heartbeatIntervalMs?: number
}

export class RunnerNatsHandler {
  private readonly nc: NatsConnection
  private readonly agent: RunnerAgent
  private readonly runnerId: string
  private readonly heartbeatIntervalMs: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private subscriptions: Subscription[] = []

  constructor(options: RunnerNatsHandlerOptions) {
    this.nc = options.nc
    this.agent = options.agent
    this.runnerId = options.runnerId
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000
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
    const providers: RunnerRegistration["providers"] = ["claude", "codex"]
    const registration: RunnerRegistration = {
      runnerId: this.runnerId,
      pid: process.pid,
      startedAt: Date.now(),
      providers,
      protocolVersion,
      capabilities: { providers },
    }
    try {
      const kvm = new Kvm(this.nc)
      const kvStore = await kvm.create(RUNNER_REGISTRY_BUCKET, {
        max_bytes: 1024 * 1024,
      })
      await kvStore.put(this.runnerId, encoder.encode(JSON.stringify(registration)))
    } catch (error) {
      // KV bucket may already exist — try to open instead
      try {
        const kvm = new Kvm(this.nc)
        const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
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
  }

  /** Test-only wrapper for the private heartbeat publisher. */
  publishHeartbeatForTest(): void {
    this.publishHeartbeat()
  }
}

import path from "node:path"
import { APP_NAME, getRuntimeProfile, LOG_PREFIX } from "../shared/branding"
import { EventStore } from "./event-store"
import { discoverProjects, type DiscoveredProject } from "./discovery"
import { getMachineDisplayName } from "./machine-name"
import { TerminalManager } from "./terminal-manager"
import { UpdateManager } from "./update-manager"
import type { UpdateInstallAttemptResult } from "./cli-runtime"
import { NatsDaemonManager, type NatsDaemonReadiness } from "./nats-daemon-manager"
import { NatsConnector } from "./nats-connector"
import { generateAuthToken } from "./nats-auth"
import { requiresCalloutForBind } from "./nats-bind-guard"
import { readToken } from "../nats/nats-token"
import { ensureCalloutKeys } from "../nats/auth-callout/keys"
import { mintCredentialToken } from "../nats/auth-callout/token"
import { createNatsPublisher } from "./nats-publisher"
import { registerCommandResponders } from "./nats-responders"
import { ensureTerminalEventsStream, ensureChatMessageStream, ensureRunnerEventsStream, ensureWorkspaceCoordinationStream, ensureSandboxEventsStream, ensureRunnerRegistryBucket } from "./nats-streams"
import { RunnerManager, type RunnerReadiness } from "./runner-manager"
import { PairingStore } from "./pairing-store"
import { RunnerProxy } from "./runner-proxy"
import { TranscriptConsumer } from "./transcript-consumer"
import type { AgentProvider, TranscriptEntry, SessionStatus } from "../shared/types"
import type { ClientCommand } from "../shared/protocol"
import { SessionOrchestrator } from "./orchestration"
import { SessionIndex } from "./session-index"
import { TranscriptSearchIndex } from "./transcript-search"
import { WorkspaceAgent } from "./workspace-agent"
import { createWorkspaceAgentRouter } from "./workspace-agent-routes"
import { SkillCache } from "./skill-discovery"
import { WorkspaceConfigManager } from "./workspace-config-manager"
import { WorkspaceDirectoryPolicy } from "./workspace-directory-policy"
import { RepoManager } from "./repo-manager"
import { GitClonePolicy } from "./git-clone-policy"
import { WorkflowStore } from "./workflow-store"
import { WorkflowEngine } from "./workflow-engine"
import { initVapid, PushSubscriptionStore, createPushRouter, sendPushToAll } from "./push-notifications"
import { BunDockerClient, SandboxManager } from "./sandbox-manager"
import { RuntimeRegistry } from "./runtime-registry"
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk"
import type { DiscoveredModel } from "../shared/runtime-types"
import { createExtensionRouter } from "./extension-router"
import { serverExtensions } from "./extensions.config"
import { DelegationCoordinator, type DelegationStore } from "./delegation-coordinator"

export interface StartServerOptions {
  port?: number
  host?: string
  strictPort?: boolean
  sandbox?: boolean
  onMigrationProgress?: (message: string) => void
  update?: {
    version: string
    fetchLatestVersion: (packageName: string) => Promise<string>
    installVersion: (packageName: string, version: string) => UpdateInstallAttemptResult
  }
}

export const NATS_WS_PROXY_BUFFER_LIMIT = 256

export type NatsWsProxyCounters = {
  upgrades: number
  upstreamOpen: number
  upstreamError: number
  upstreamClose: number
  sendOnConnecting: number
  bufferedFrames: number
  bufferDrops: number
  // Lazy-mode visibility: number of clients we replayed cached INFO to,
  // and number of duplicate INFO frames we suppressed from the real upstream.
  cacheReplay: number
  firstUpstreamDropped: number
  lazyHelloDeferred: number
}

// Strings or owned ArrayBuffers — never Bun's recv Buffer slices, which get
// reused out from under us.
type NatsWsBufferedFrame = string | ArrayBuffer

export type NatsWsProxyData = {
  wsPort: number
  upstream: WebSocket | null
  ready: boolean
  closed: boolean
  buffer: NatsWsBufferedFrame[]
  droppedSinceLastLog: number
  openedAt: number
  // Lazy mode: true between proxy.open and the first client frame.
  // While true, we have NOT opened the upstream yet — the browser sees a
  // synthetic INFO replayed from cache and is waiting to send its CONNECT.
  awaitingHello: boolean
  // Lazy mode: drop the first frame the upstream sends us once it opens.
  // That frame is NATS's own INFO, which would be a duplicate of what the
  // browser already received from cache.
  skipFirstUpstreamFrame: boolean
}

type IncomingWsMessage = string | Buffer<ArrayBuffer>

function toBufferedFrame(message: IncomingWsMessage): NatsWsBufferedFrame {
  if (typeof message === "string") return message
  const copy = new ArrayBuffer(message.byteLength)
  new Uint8Array(copy).set(message)
  return copy
}

export interface CachedNatsInfo {
  bytes: Uint8Array
  isBinary: boolean
}

// Warmup helper: opens a one-shot WebSocket to NATS and captures the very
// first frame (the INFO line) raw. We need this so the proxy can replay INFO
// to browser clients WITHOUT having to open an upstream connection first —
// which is what causes NATS's 2-second auth-timeout clock to start before
// the browser has had time to send CONNECT over a high-latency path.
export async function warmupCachedNatsInfo(
  natsWsUrl: string,
  timeoutMs: number = 5000,
): Promise<CachedNatsInfo | null> {
  return await new Promise<CachedNatsInfo | null>((resolve) => {
    let settled = false
    let ws: WebSocket
    const finish = (result: CachedNatsInfo | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws?.close() } catch (_err: unknown) { /* ignore close errors */ }
      resolve(result)
    }
    const timer = setTimeout(() => {
      console.warn(LOG_PREFIX, `nats-ws INFO warmup timed out after ${timeoutMs}ms`)
      finish(null)
    }, timeoutMs)
    try {
      ws = new WebSocket(natsWsUrl)
    } catch (err) {
      console.warn(LOG_PREFIX, `nats-ws INFO warmup failed to open: ${err instanceof Error ? err.message : String(err)}`)
      finish(null)
      return
    }
    ws.binaryType = "arraybuffer"
    ws.onmessage = (event) => {
      if (settled) return
      if (typeof event.data === "string") {
        finish({ bytes: new TextEncoder().encode(event.data), isBinary: false })
      } else {
        const ab = event.data as ArrayBuffer
        const bytes = new Uint8Array(ab.byteLength)
        bytes.set(new Uint8Array(ab))
        finish({ bytes, isBinary: true })
      }
    }
    ws.onerror = () => {
      console.warn(LOG_PREFIX, "nats-ws INFO warmup WebSocket error")
      finish(null)
    }
    ws.onclose = () => finish(null)
  })
}

export function createNatsWsProxyHandlers(
  counters: NatsWsProxyCounters = {
    upgrades: 0,
    upstreamOpen: 0,
    upstreamError: 0,
    upstreamClose: 0,
    sendOnConnecting: 0,
    bufferedFrames: 0,
    bufferDrops: 0,
    cacheReplay: 0,
    firstUpstreamDropped: 0,
    lazyHelloDeferred: 0,
  },
  cachedInfo: CachedNatsInfo | null = null,
) {
  const lazyMode = cachedInfo !== null

  function openUpstream(ws: import("bun").ServerWebSocket<NatsWsProxyData>) {
    const upstream = new WebSocket(`ws://127.0.0.1:${ws.data.wsPort}`)
    upstream.binaryType = "arraybuffer"
    ws.data.upstream = upstream

    upstream.onopen = () => {
      if (ws.data.closed) {
        upstream.close()
        return
      }
      const elapsed = Date.now() - ws.data.openedAt
      ws.data.ready = true
      counters.upstreamOpen += 1
      console.warn(LOG_PREFIX, `nats-ws proxy upstream open t=${elapsed}ms`)

      const pending = ws.data.buffer
      ws.data.buffer = []
      for (const frame of pending) {
        upstream.send(frame)
      }
    }

    upstream.onmessage = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return
      // Lazy mode: drop the very first frame from the upstream — it's NATS's
      // own INFO, which the browser already received from the cache replay at
      // proxy.open. Forwarding it would give the browser a second INFO with a
      // different client_id mid-handshake, which nats-core would treat as a
      // cluster update and could cause it to second-guess the active inbox sub.
      if (ws.data.skipFirstUpstreamFrame) {
        ws.data.skipFirstUpstreamFrame = false
        counters.firstUpstreamDropped += 1
        return
      }
      if (typeof event.data === "string") {
        ws.sendText(event.data)
      } else {
        ws.sendBinary(new Uint8Array(event.data as ArrayBuffer))
      }
    }

    upstream.onclose = (event) => {
      counters.upstreamClose += 1
      const duration = Date.now() - ws.data.openedAt
      console.warn(
        LOG_PREFIX,
        `nats-ws proxy upstream close code=${event.code} duration=${duration}ms`,
      )
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }

    upstream.onerror = () => {
      counters.upstreamError += 1
      console.warn(LOG_PREFIX, "nats-ws proxy upstream error")
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }

  const handlers = {
    open(ws: import("bun").ServerWebSocket<NatsWsProxyData>) {
      counters.upgrades += 1
      ws.data.openedAt = Date.now()
      ws.data.ready = false
      ws.data.closed = false
      ws.data.buffer = []
      ws.data.droppedSinceLastLog = 0
      ws.data.awaitingHello = false
      ws.data.skipFirstUpstreamFrame = false

      if (lazyMode && cachedInfo) {
        // Lazy path: replay cached INFO so the browser's nats-core advances
        // its state machine and prepares to send CONNECT. Defer opening the
        // upstream until the browser actually sends its first frame, so
        // NATS's auth-timeout clock starts only when CONNECT is in our hand.
        console.warn(LOG_PREFIX, "nats-ws proxy upgrade accepted (lazy)")
        ws.data.awaitingHello = true
        ws.data.skipFirstUpstreamFrame = true
        counters.lazyHelloDeferred += 1
        try {
          if (cachedInfo.isBinary) {
            ws.sendBinary(cachedInfo.bytes)
          } else {
            ws.sendText(new TextDecoder().decode(cachedInfo.bytes))
          }
          counters.cacheReplay += 1
        } catch (err) {
          console.warn(
            LOG_PREFIX,
            `nats-ws proxy failed to replay cached INFO: ${err instanceof Error ? err.message : String(err)}`,
          )
          ws.close()
        }
        return
      }

      // Eager fallback: original behavior used when warmup didn't produce a
      // cache. Logs loudly so the operator knows the auth-race protection is
      // disabled for this run.
      console.warn(LOG_PREFIX, "nats-ws proxy upgrade accepted (eager — no INFO cache)")
      openUpstream(ws)
    },

    message(ws: import("bun").ServerWebSocket<NatsWsProxyData>, message: IncomingWsMessage) {
      if (ws.data.awaitingHello) {
        // First client frame in lazy mode. Open the upstream NOW and put this
        // frame at the head of the buffer — it'll be the first thing flushed
        // when upstream's onopen fires, so NATS receives CONNECT within one
        // localhost roundtrip of starting its auth clock.
        ws.data.awaitingHello = false
        counters.bufferedFrames += 1
        ws.data.buffer.push(toBufferedFrame(message))
        openUpstream(ws)
        return
      }

      const upstream = ws.data.upstream
      if (ws.data.ready && upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(message)
        ws.data.droppedSinceLastLog = 0
        return
      }

      counters.sendOnConnecting += 1
      counters.bufferedFrames += 1
      ws.data.buffer.push(toBufferedFrame(message))

      if (ws.data.buffer.length > NATS_WS_PROXY_BUFFER_LIMIT) {
        ws.data.buffer.shift()
        counters.bufferDrops += 1
        ws.data.droppedSinceLastLog += 1
        if (ws.data.droppedSinceLastLog === 1) {
          console.warn(
            LOG_PREFIX,
            `nats-ws proxy buffer overflow — dropping oldest frame (limit=${NATS_WS_PROXY_BUFFER_LIMIT})`,
          )
        }
      }
    },
    close(ws: import("bun").ServerWebSocket<NatsWsProxyData>) {
      ws.data.closed = true
      const duration = Date.now() - ws.data.openedAt
      console.warn(LOG_PREFIX, `nats-ws proxy client close duration=${duration}ms`)
      ws.data.buffer = []
      ws.data.upstream?.close()
      ws.data.upstream = null
      ws.data.ready = false
      ws.data.awaitingHello = false
    },
  }
  return { handlers, counters }
}

export interface ServerHealthcheck {
  ok: boolean
  status: "ok" | "degraded" | "fail"
  port: number
  natsWsPort: number
  natsDaemon: NatsDaemonReadiness | null
  natsConnection: ReturnType<NatsConnector["getReadiness"]>
  runner: RunnerReadiness
}

/** Session coordinator interface — satisfied by RunnerProxy which delegates turn execution to the runner process. */
interface SessionCoordinator {
  send(command: Extract<ClientCommand, { type: "chat.send" }>): Promise<{ chatId: string }>
  queue(command: Extract<ClientCommand, { type: "chat.queue" }>): Promise<{ chatId: string; queued: boolean }>
  drainQueuedTurn(chatId: string): Promise<boolean>
  cancel(chatId: string): Promise<void>
  respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void>
  disposeChat(chatId: string): Promise<void>
  getActiveStatuses(): Map<string, SessionStatus>
  activeTurns: { has(key: string): boolean }
  startTurnForChat(args: {
    chatId: string; provider: AgentProvider; content: string
    delegatedContext?: string; isSpawned?: boolean; model: string; effort?: string
    serviceTier?: "fast"; planMode: boolean; appendUserPrompt: boolean
  }): Promise<void>
}

export async function startServer(options: StartServerOptions = {}) {
  const port = options.port ?? 3210
  const hostname = options.host ?? "127.0.0.1"
  const strictPort = options.strictPort ?? false
  const store = new EventStore()
  const machineDisplayName = getMachineDisplayName()
  await store.initialize()
  await store.migrateLegacyTranscripts(options.onMigrationProgress)
  let discoveredProjects: DiscoveredProject[] = []

  async function refreshDiscovery() {
    discoveredProjects = discoverProjects()
    return discoveredProjects
  }

  await refreshDiscovery()

  let server: ReturnType<typeof Bun.serve>
  const terminals = new TerminalManager()
  const updateManager = options.update
    ? new UpdateManager({
      currentVersion: options.update.version,
      fetchLatestVersion: options.update.fetchLatestVersion,
      installVersion: options.update.installVersion,
      devMode: getRuntimeProfile() === "dev",
    })
    : null

  const natsMode = process.env.NATS_MODE ?? "embedded"
  const authMode = process.env.NATS_AUTH_MODE ?? "callout"
  const runnerMode = process.env.RUNNER_MODE ?? "spawn"

  // Guard: a non-loopback bind is only safe in callout mode (decision 0007).
  // Token mode must stay loopback-only — a shared-token bus must not be exposed
  // beyond the local machine. Callout mode provides per-connection scoped creds,
  // so WireGuard on the tailnet is sufficient for confidentiality (no TLS needed).
  const bindGuard = requiresCalloutForBind(hostname, authMode as "callout" | "token")
  if (!bindGuard.ok) {
    throw new Error(bindGuard.reason!)
  }
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1" && authMode === "callout") {
    console.warn(LOG_PREFIX, `Binding NATS to ${hostname} in callout mode — confidentiality via WireGuard, WS no_tls within the tailnet`)
  }

  let authToken: string
  let daemonManager: NatsDaemonManager
  let daemonInfo: { url: string; wsUrl: string; wsPort: number }

  // Callout mode: stateless signed tokens per connection class.
  // Token mode (NATS_AUTH_MODE=token): shared static token — legacy escape hatch.
  let uiClientToken: string   // returned by /auth/token for browser WS connections
  let mintRunnerToken: ((runnerId: string) => Promise<string>) | undefined
  // Durable runner credential mint for pairing (callout mode only).
  // RUNNER_PAIR_TTL: long-lived token TTL in seconds (default 90 days).
  // Paired runners persist this token and present it at every NATS connect.
  const runnerPairTtl = Number(process.env.RUNNER_PAIR_TTL ?? 7_776_000)
  let mintPairedRunnerToken: ((runnerId: string) => Promise<string>) | undefined

  if (natsMode === "external") {
    const natsUrl = process.env.NATS_URL
    const natsWsPort = Number(process.env.NATS_WS_PORT)
    const natsDataDir = process.env.NATS_DATA_DIR
    if (!natsUrl || !natsWsPort || !natsDataDir) {
      throw new Error("NATS_MODE=external requires NATS_URL, NATS_WS_PORT, and NATS_DATA_DIR")
    }
    authToken = await readToken(natsDataDir)
    uiClientToken = authToken
    daemonManager = NatsDaemonManager.fromExternal({ natsUrl, wsPort: natsWsPort })
    const url = new URL(natsUrl)
    daemonInfo = { url: natsUrl, wsUrl: `ws://${url.hostname}:${natsWsPort}`, wsPort: natsWsPort }
    console.warn(LOG_PREFIX, `NATS_MODE=external — connecting to ${natsUrl}`)
  } else if (authMode === "callout") {
    // Callout mode: load (or generate) signing keys + shared token secret.
    const natsDataDir = process.env.NATS_DATA_DIR ?? store.dataDir
    // The callout daemon child (spawned by ensureDaemon) loads its keys + token
    // secret from NATS_DATA_DIR and refuses to start without it. ensureDaemon
    // reads it from the environment, so default the env to the resolved dir here
    // — otherwise a normal `tinkaria` run (no NATS_DATA_DIR set) fails to boot.
    process.env.NATS_DATA_DIR ??= natsDataDir
    const keys = await ensureCalloutKeys(natsDataDir)

    authToken = await mintCredentialToken({ class: "server-admin" }, keys.tokenSecret)
    uiClientToken = await mintCredentialToken({ class: "ui-client" }, keys.tokenSecret)
    mintRunnerToken = (runnerId: string) =>
      mintCredentialToken({ class: "runner", runnerId }, keys.tokenSecret)
    // Paired runners get a long-lived token (RUNNER_PAIR_TTL, default 90d).
    mintPairedRunnerToken = (runnerId: string) =>
      mintCredentialToken({ class: "runner", runnerId }, keys.tokenSecret, runnerPairTtl)

    daemonManager = NatsDaemonManager.embedded()
    const info = await daemonManager.ensureDaemon({ token: authToken, host: hostname })
    daemonInfo = info
    console.warn(LOG_PREFIX, `NATS_AUTH_MODE=callout — scoped credentials active`)
  } else {
    // Token mode (legacy escape hatch): shared static token, token-mode daemon.
    authToken = generateAuthToken()
    uiClientToken = authToken
    daemonManager = NatsDaemonManager.embedded()
    const info = await daemonManager.ensureDaemon({ token: authToken, host: hostname })
    daemonInfo = info
  }

  // Pairing code store (callout mode only — see POST /api/pairing/code).
  const pairingStore = new PairingStore()

  // Push notifications
  initVapid()
  const pushStore = new PushSubscriptionStore(path.join(store.dataDir, "push-subscriptions.json"))
  await pushStore.load()
  const pushRouter = createPushRouter(pushStore)

  const natsConnector = await NatsConnector.connect({
    natsUrl: daemonInfo.url,
    natsWsUrl: daemonInfo.wsUrl,
    natsWsPort: daemonInfo.wsPort,
    token: authToken,
  })
  await Promise.all([
    ensureTerminalEventsStream(natsConnector.nc),
    ensureChatMessageStream(natsConnector.nc),
    ensureRunnerEventsStream(natsConnector.nc),
    ensureWorkspaceCoordinationStream(natsConnector.nc),
    ensureSandboxEventsStream(natsConnector.nc),
    // Pre-create the runner registry KV bucket so spawned runners (whose
    // callout scope excludes STREAM.CREATE) can open it immediately.
    ensureRunnerRegistryBucket(natsConnector.nc),
  ])

  const getHealthcheck = (): ServerHealthcheck => {
    const natsDaemon = daemonManager.getReadiness()
    const natsConnection = natsConnector.getReadiness()
    const runner = runnerManager.getReadiness()
    const hardFailure = !natsDaemon?.ok || !natsConnection.ok || !runner.ok
    return {
      ok: !hardFailure,
      status: hardFailure ? "fail" : "ok",
      port: actualPort,
      natsWsPort: natsConnector.natsWsPort,
      natsDaemon,
      natsConnection,
      runner,
    }
  }

  // Project agent: cross-session awareness and coordination
  const sessionIndex = new SessionIndex()
  const transcriptSearch = new TranscriptSearchIndex()
  const projectAgent = new WorkspaceAgent({
    sessions: sessionIndex,
    store,
    search: transcriptSearch,
    workspaceId: "",
  })
  const projectAgentRouter = createWorkspaceAgentRouter(projectAgent)
  const extensionRouter = createExtensionRouter(serverExtensions)

  // Use indirection to break the circular dependency:
  // coordinator -> onStateChange -> publisher.broadcastSnapshots
  // publisher -> coordinator.getActiveStatuses
  //
  // Debounce: during streaming, dozens of events arrive per second.
  // Each calls onStateChange() which would trigger broadcastSnapshots().
  // Coalesce into one broadcast per microtask tick using queueMicrotask.
  // Selective invalidation: only recompute topic types that changed.
  let broadcastPending = false
  const pendingTypes = new Set<string>()
  let broadcastFn: (changedTypes?: ReadonlySet<string>) => void = () => {}
  const broadcast = (changedTypes?: ReadonlySet<string>) => {
    if (changedTypes) {
      for (const t of changedTypes) pendingTypes.add(t)
    }
    if (broadcastPending) return
    broadcastPending = true
    queueMicrotask(() => {
      broadcastPending = false
      const types = pendingTypes.size > 0 ? new Set(pendingTypes) : undefined
      pendingTypes.clear()
      broadcastFn(types)
    })
  }
  let publishMessage: (chatId: string, entry: TranscriptEntry) => void = () => {}
  let reconcileDelegation: (workspaceId: string, chatId: string, outcome: "success" | "failed" | "cancelled") => void = () => {}

  const onMessageAppended = (chatId: string, entry: TranscriptEntry) => {
    publishMessage(chatId, entry)
    sessionIndex.onMessageAppended(chatId, entry, store.state)
    transcriptSearch.addEntry(chatId, entry)
    orchestrator.onMessageAppended(chatId, entry)
  }

  const skillCache = new SkillCache()

  // ── Runner process handles all turn execution ──
  const runnerManager = new RunnerManager({
    nc: natsConnector.nc,
    natsUrl: daemonInfo.url,
    authToken,
    mintToken: mintRunnerToken,
    mode: runnerMode as "spawn" | "discover",
  })
  const runnerId = await runnerManager.ensureRunner()

  const chatSidebarTypes = new Set(["chat", "sidebar", "orchestration"])
  const previousStatuses = new Map<string, string>()
  const transcriptConsumer = new TranscriptConsumer({
    nc: natsConnector.nc,
    store,
    onStateChange: () => {
      broadcast(chatSidebarTypes)
      // Push notification triggers
      const currentActive = transcriptConsumer.getActiveStatuses()
      // Check for newly waiting_for_user
      for (const [chatId, status] of currentActive) {
        const prev = previousStatuses.get(chatId)
        if (status === "waiting_for_user" && prev !== "waiting_for_user") {
          const chat = store.state.chatsById.get(chatId)
          void sendPushToAll(pushStore, {
            title: "Input needed",
            body: chat?.title || chatId,
            url: `/chat/${chatId}`,
            tag: `waiting-${chatId}`,
          })
        }
      }
      // Check for chats that were active but are now gone (turn ended)
      for (const [chatId, prevStatus] of previousStatuses) {
        if (!currentActive.has(chatId) && prevStatus !== "waiting_for_user") {
          const chat = store.state.chatsById.get(chatId)
          const outcome = chat?.lastTurnOutcome
          if (outcome === "success") {
            void sendPushToAll(pushStore, {
              title: "Agent finished",
              body: chat?.title || chatId,
              url: `/chat/${chatId}`,
              tag: `turn-${chatId}`,
            })
          } else if (outcome === "failed") {
            void sendPushToAll(pushStore, {
              title: "Agent failed",
              body: chat?.title || chatId,
              url: `/chat/${chatId}`,
              tag: `turn-${chatId}`,
            })
          }

          // Delegation reconciliation: if this chat was a delegation child, reconcile and possibly resume the parent
          const chatRecord = store.state.chatsById.get(chatId)
          if (chatRecord?.lastTurnOutcome) {
            reconcileDelegation(chatRecord.workspaceId, chatId, chatRecord.lastTurnOutcome)
          }

          void coordinator.drainQueuedTurn(chatId).catch((error) => {
            console.warn(LOG_PREFIX, "queued chat drain failed:", error instanceof Error ? error.message : String(error))
          })
        }
      }
      // Sync previousStatuses
      previousStatuses.clear()
      for (const [chatId, status] of currentActive) {
        previousStatuses.set(chatId, status)
      }
    },
    onMessageAppended,
  })

  const runtimeRegistry = new RuntimeRegistry(path.join(store.dataDir, "runtimes"), {
    probeClaudeModels: async (binaryPath: string): Promise<DiscoveredModel[]> => {
      const q = sdkQuery({
        prompt: "",
        options: {
          pathToClaudeCodeExecutable: binaryPath,
          tools: [],
          permissionMode: "bypassPermissions",
          persistSession: false,
        },
      })
      let timer: ReturnType<typeof setTimeout>
      try {
        const models = await Promise.race([
          q.supportedModels(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Model probe timed out")), 15_000)
          }),
        ])
        return models.map((m) => ({
          value: m.value,
          displayName: m.displayName,
          description: m.description,
          supportsEffort: m.supportsEffort,
          supportedEffortLevels: m.supportedEffortLevels,
          supportsAdaptiveThinking: m.supportsAdaptiveThinking,
          supportsFastMode: m.supportsFastMode,
          supportsAutoMode: m.supportsAutoMode,
        }))
      } finally {
        clearTimeout(timer!)
        try { q.close() } catch (_) { /* close may fail on timed-out probes */ }
      }
    },
  })
  await runtimeRegistry.initialize()

  const coordinator: SessionCoordinator = new RunnerProxy({
    nc: natsConnector.nc,
    store,
    runnerId,
    getActiveStatuses: () => transcriptConsumer.getActiveStatuses(),
    runtimeRegistry,
    getRunnerReadiness: () => runnerManager.getReadiness(),
  })

  console.warn(LOG_PREFIX, "Runner process handles turn execution")

  // ── Durable delegation coordinator ──
  const delegationStoreAdapter: DelegationStore = {
    appendMessage: (chatId, entry) => store.appendMessage(chatId, entry),
    chatExists: (chatId) => {
      const chat = store.state.chatsById.get(chatId)
      return chat != null && chat.deletedAt == null
    },
    getChatWorkspaceId: (chatId) => store.state.chatsById.get(chatId)?.workspaceId,
    getLastTurnOutcome: (chatId) => store.state.chatsById.get(chatId)?.lastTurnOutcome ?? undefined,
  }
  const delegationCoordinator = new DelegationCoordinator(natsConnector.nc, delegationStoreAdapter)
  await delegationCoordinator.initialize()
  await delegationCoordinator.bootReconciliation()

  const orchestrator = new SessionOrchestrator({
    store,
    coordinator,
    delegationCoordinator,
  })

  // Start after orchestrator exists — onMessageAppended closes over it
  await transcriptConsumer.start()

  const publisher = await createNatsPublisher({
    nc: natsConnector.nc,
    store,
    agent: coordinator,
    terminals,
    refreshDiscovery,
    getDiscoveredProjects: () => discoveredProjects,
    machineDisplayName,
    updateManager,
    skillCache,
    orchestrator,
    runtimeRegistry,
    hasActiveBlockingDelegations: delegationCoordinator.hasActiveBlockingDelegations.bind(delegationCoordinator),
  })

  broadcastFn = (types) => publisher.broadcastSnapshots(types)
  publishMessage = (chatId, entry) => publisher.publishChatMessage(chatId, entry)
  reconcileDelegation = (workspaceId, chatId, outcome) => {
    void delegationCoordinator
      .reconcileChildTerminal(workspaceId, chatId, { outcome })
      .then((result) => {
        if (result && !("alreadyReconciled" in result) && result.resumeEligible) {
          void coordinator.drainQueuedTurn(result.parentChatId).catch((err) => {
            console.warn(LOG_PREFIX, "delegation parent drain failed:", err instanceof Error ? err.message : String(err))
          })
        }
      })
      .catch((err) => {
        console.warn(LOG_PREFIX, "delegation reconciliation failed:", err instanceof Error ? err.message : String(err))
      })
  }

  const responders = registerCommandResponders({
    nc: natsConnector.nc,
    store,
    agent: coordinator,
    terminals,
    refreshDiscovery,
    updateManager,
    publisher,
    onStateChange: () => publisher.broadcastSnapshots(),
    repoManager: new RepoManager(),
    clonePolicy: new GitClonePolicy(store, new RepoManager(), () => publisher.broadcastSnapshots()),
    directoryPolicy: new WorkspaceDirectoryPolicy(
      store,
      new WorkspaceConfigManager(path.join(store.dataDir, "workspaces")),
      () => publisher.broadcastSnapshots(),
    ),
    workflowStore: new WorkflowStore(path.join(store.dataDir, "workflows")),
    workflowEngine: new WorkflowEngine({
      emitter: store,
      dispatcher: { dispatch: async () => "" },
      resolveRepos: async (workspaceId: string) => {
        return [...store.state.reposById.values()]
          .filter((r) => r.workspaceId === workspaceId)
          .map((r) => r.id)
      },
      onProgress: () => publisher.broadcastSnapshots(),
    }),
    sandboxManager: options.sandbox ? new SandboxManager(new BunDockerClient(), "nats://host.docker.internal:4222") : null,
    runtimeRegistry,
  })

  const distDir = path.join(import.meta.dir, "..", "..", "dist", "client")

  // Warm up the synthetic INFO cache used by the lazy-upstream proxy path.
  // See createNatsWsProxyHandlers / warmupCachedNatsInfo for why this exists.
  // If warmup fails we fall back to eager mode (the legacy auth-race path).
  const warmupUrl = `ws://127.0.0.1:${natsConnector.natsWsPort}`
  const cachedNatsInfo = await warmupCachedNatsInfo(warmupUrl)
  if (cachedNatsInfo) {
    console.warn(
      LOG_PREFIX,
      `nats-ws INFO cache warmed (${cachedNatsInfo.bytes.length} bytes, ${cachedNatsInfo.isBinary ? "binary" : "text"})`,
    )
  } else {
    console.warn(
      LOG_PREFIX,
      "nats-ws INFO cache UNAVAILABLE — proxy will fall back to eager upstream (auth-race risk on slow networks)",
    )
  }

  const { handlers: natsWsHandlers, counters: natsWsCounters } = createNatsWsProxyHandlers(undefined, cachedNatsInfo)
  const natsWsCounterInterval = setInterval(() => {
    const hasActivity = Object.values(natsWsCounters).some((v) => v > 0)
    if (!hasActivity) return
    console.warn(LOG_PREFIX, "nats-ws proxy counters:", JSON.stringify(natsWsCounters))
    for (const key of Object.keys(natsWsCounters) as (keyof NatsWsProxyCounters)[]) {
      natsWsCounters[key] = 0
    }
  }, 60_000)

  const MAX_PORT_ATTEMPTS = 20
  let actualPort = port

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      server = Bun.serve<NatsWsProxyData>({
        port: actualPort,
        hostname,
        async fetch(req, srv) {
          const url = new URL(req.url)

          if (url.pathname === "/nats-ws") {
            const upgraded = srv.upgrade(req, {
              data: {
                wsPort: natsConnector.natsWsPort,
                upstream: null,
                ready: false,
                closed: false,
                buffer: [],
                droppedSinceLastLog: 0,
                openedAt: 0,
                awaitingHello: false,
                skipFirstUpstreamFrame: false,
              },
            })
            if (upgraded) return undefined
            return new Response("WebSocket upgrade failed", { status: 426 })
          }

          if (url.pathname === "/health") {
            const healthcheck = getHealthcheck()
            return Response.json(healthcheck, {
              status: healthcheck.ok ? 200 : 503,
            })
          }

          if (url.pathname === "/auth/token") {
            const advertisedHost = process.env.NATS_ADVERTISED_HOST
            const natsWsUrl = advertisedHost
              ? `ws://${advertisedHost}:${natsConnector.natsWsPort}`
              : undefined
            // In callout mode: return the ui-client scoped token (not the server-admin token).
            // In token mode: uiClientToken === authToken — same behaviour as before.
            return Response.json({
              token: uiClientToken,
              ...(natsWsUrl ? { natsWsUrl } : {}),
            })
          }

          // ── Pairing endpoints (PR2) ─────────────────────────────────────────
          //
          // Both routes are public (no user auth), matching /auth/token's posture.
          // The code itself is the bearer secret — short TTL, single-use, unguessable.
          // Gating on user-auth is the documented pre-multi-tenant follow-up.
          //
          if (url.pathname === "/api/pairing/code" && req.method === "POST") {
            // Only available in callout mode — the minted token is a callout credential.
            if (!mintPairedRunnerToken) {
              return Response.json(
                { error: "pairing requires NATS_AUTH_MODE=callout" },
                { status: 409 }
              )
            }
            // Allocate a runnerId (same format as runner-manager's spawned runners).
            const newRunnerId = `runner-${Date.now()}-${process.pid}`
            const token = await mintPairedRunnerToken(newRunnerId)
            const { code, expiresAt } = pairingStore.issue({ runnerId: newRunnerId, token })
            console.warn(LOG_PREFIX, `Pairing code issued for runner ${newRunnerId}, expires ${new Date(expiresAt).toISOString()}`)
            return Response.json({ code, expiresAt })
          }

          if (url.pathname === "/api/pairing/exchange" && req.method === "POST") {
            let body: { code?: unknown }
            try {
              body = await req.json() as { code?: unknown }
            } catch {
              return Response.json({ error: "invalid JSON body" }, { status: 400 })
            }
            const code = body?.code
            if (typeof code !== "string" || !code.trim()) {
              return Response.json({ error: "missing or invalid code" }, { status: 400 })
            }
            const result = pairingStore.exchange(code)
            if (!result.ok) {
              const isGone = result.error === "expired" || result.error === "consumed"
              console.warn(LOG_PREFIX, `Pairing exchange rejected: ${result.error}`)
              return Response.json({ error: result.error }, { status: isGone ? 410 : 400 })
            }
            console.warn(LOG_PREFIX, `Pairing exchange succeeded for runner ${result.runnerId}`)
            return Response.json({
              runnerId: result.runnerId,
              token: result.token,
              natsUrl: daemonInfo.url,
              natsWsUrl: daemonInfo.wsUrl,
            })
          }

          if (url.pathname.startsWith("/api/workspace/")) {
            return projectAgentRouter(req)
          }

          if (url.pathname.startsWith("/api/ext/")) {
            return extensionRouter(req)
          }

          if (url.pathname.startsWith("/api/push/")) {
            return pushRouter(req)
          }

          return serveStatic(distDir, url.pathname)
        },
        websocket: natsWsHandlers,
      })
      break
    } catch (err: unknown) {
      const isAddrInUse =
        err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EADDRINUSE"
      if (!isAddrInUse || strictPort || attempt === MAX_PORT_ATTEMPTS - 1) {
        throw err
      }
      console.log(`Port ${actualPort} is in use, trying ${actualPort + 1}...`)
      actualPort++
    }
  }

  console.warn(LOG_PREFIX, `Operational health initialized — status: ${getHealthcheck().status}`)

  const shutdown = async () => {
    clearInterval(natsWsCounterInterval)
    orchestrator.destroy()
    responders.dispose()
    publisher.dispose()
    terminals.closeAll()
    transcriptConsumer.stop()
    await runnerManager.dispose()
    await natsConnector.dispose()
    await daemonManager.dispose()
    await store.compact()
    server.stop(true)
  }

  return {
    port: actualPort,
    store,
    updateManager,
    healthcheck: getHealthcheck,
    stop: shutdown,
  }
}

async function serveStatic(distDir: string, pathname: string) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname
  const filePath = path.join(distDir, requestedPath)
  const indexPath = path.join(distDir, "index.html")

  const file = Bun.file(filePath)
  if (await file.exists()) {
    const isHashedAsset = requestedPath.startsWith("/assets/")
    const isHtml = requestedPath.endsWith(".html")
    const cacheControl = isHashedAsset
      ? "public, max-age=31536000, immutable"
      : isHtml
        ? "no-cache"
        : undefined

    const headers: Record<string, string> = {}
    if (cacheControl) headers["Cache-Control"] = cacheControl

    return new Response(file, { headers })
  }

  const indexFile = Bun.file(indexPath)
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  }

  return new Response(
    `${APP_NAME} client bundle not found. Run \`bun run build\` inside workbench/ first.`,
    { status: 503 }
  )
}

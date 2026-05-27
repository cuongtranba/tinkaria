import type { NatsConnection } from "@nats-io/transport-node"
import type { ClientCommand } from "../shared/protocol"
import type { ProviderProfileRecord } from "../shared/profile-types"
import { resolveProfile } from "../shared/profile-types"
import type { AgentProvider, SessionStatus, PendingToolSnapshot } from "../shared/types"
import { resolveClaudeApiModelId } from "../shared/types"
import { runnerCmdSubject, SUPPORTED_RANGE, type RunnerCapabilities, type StartTurnCommand } from "../shared/runner-protocol"
import type { EventStore } from "./event-store"
import type { RuntimeRegistry } from "./runtime-registry"
import type { RunnerRouter } from "./runner-router"
import {
  deriveServerProviderCatalog,
  getServerProviderCatalog,
  normalizeClaudeModelOptions,
  normalizeServerModel,
} from "./provider-catalog"

// ── RunnerPickRequired ────────────────────────────────────────────────────────

/**
 * Thrown by `resolveRunnerForChat` when selection returns `needs_pick` with
 * non-empty candidates. The WS layer converts this to a `chat.runnerPickRequired`
 * event so the client can render a picker.
 */
export class RunnerPickRequired extends Error {
  readonly chatId: string
  readonly candidates: import("./runner-router").RunnerDescriptor[]
  readonly reason: "ambiguous" | "sticky_offline"

  constructor(args: {
    chatId: string
    candidates: import("./runner-router").RunnerDescriptor[]
    reason: "ambiguous" | "sticky_offline"
  }) {
    super(`Runner pick required for chat ${args.chatId}: ${args.reason}`)
    this.name = "RunnerPickRequired"
    this.chatId = args.chatId
    this.candidates = args.candidates
    this.reason = args.reason
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

type ChatSendCommand = Extract<ClientCommand, { type: "chat.send" }>
type ChatQueueCommand = Extract<ClientCommand, { type: "chat.queue" }>

export interface RunnerProxyOptions {
  nc: NatsConnection
  store: EventStore
  runnerId: string
  getActiveStatuses: () => Map<string, SessionStatus>
  getPendingTool?: (chatId: string) => PendingToolSnapshot | null
  runtimeRegistry?: RuntimeRegistry | null
  /** Optional: called before start_turn dispatch to enforce the protocol-version + capability gate.
   *  When `router` is provided the signature becomes `(runnerId: string) => {...}` so each runner
   *  can be checked individually. A zero-arg `() => ({...})` (as existing tests pass) is still
   *  assignable in TS — the parameter is simply ignored in the legacy path. */
  getRunnerReadiness?: (runnerId: string) => { incompatible: boolean; protocolVersion: number | null; capabilities?: RunnerCapabilities | null }
  /** PR5: optional router for per-session runner selection. When absent the proxy
   *  behaves exactly as before — always dispatching to `this.runnerId`. */
  router?: RunnerRouter
  /** PR5: returns the current shared/fallback runner id. Defaults to `() => this.runnerId`. */
  sharedRunnerId?: () => string
}

export class RunnerProxy {
  private readonly nc: NatsConnection
  private readonly store: EventStore
  private readonly runnerId: string
  private readonly _getActiveStatuses: () => Map<string, SessionStatus>
  private readonly runtimeRegistry: RuntimeRegistry | null
  private readonly _getRunnerReadiness: ((runnerId: string) => { incompatible: boolean; protocolVersion: number | null; capabilities?: RunnerCapabilities | null }) | null
  private readonly recentlyStartedChats = new Set<string>()
  private readonly router: RunnerRouter | null
  private readonly _sharedRunnerId: () => string

  /** Orchestration compatibility: check if a chat has an active turn */
  readonly activeTurns: { has(chatId: string): boolean }

  constructor(options: RunnerProxyOptions) {
    this.nc = options.nc
    this.store = options.store
    this.runnerId = options.runnerId
    this._getActiveStatuses = options.getActiveStatuses
    this.runtimeRegistry = options.runtimeRegistry ?? null
    this._getRunnerReadiness = options.getRunnerReadiness ?? null
    this.router = options.router ?? null
    this._sharedRunnerId = options.sharedRunnerId ?? (() => this.runnerId)
    this.activeTurns = {
      has: (chatId: string) => this.hasActiveOrJustStartedTurn(chatId),
    }
  }

  /**
   * Resolve profile overrides for a workspace+provider into non-secret extraEnv.
   * Binary resolution is done runner-side; the server no longer sets binaryPath.
   */
  private resolveProfileOverrides(workspaceId: string, provider: AgentProvider): { extraEnv?: Record<string, string> } {
    // Find all profiles for this provider
    const profiles = [...this.store.state.providerProfiles.values()]
      .filter((r: ProviderProfileRecord) => r.profile.provider === provider)

    if (profiles.length === 0) return {}

    // Use the first matching profile (TODO: workspace-level default selection)
    const record = profiles[0]
    const wsOverrides = this.store.state.workspaceProfileOverrides.get(workspaceId)
    const override = wsOverrides?.get(record.id)
    const resolved = resolveProfile(record.profile, override?.overrides)

    // Runtime secret-boundary guard: extraEnv transits the server → the runner,
    // so it must carry NO secrets. Drop (and warn on) any secret-shaped key/value
    // before it leaves the server — secrets are resolved runner-side only.
    const SECRET_PATTERN = /API_KEY|TOKEN|SECRET|Bearer|sk-/i
    const safe: Record<string, string> = {}
    for (const [k, v] of Object.entries(resolved.env ?? {})) {
      if (SECRET_PATTERN.test(k) || SECRET_PATTERN.test(v)) {
        console.warn(`[RunnerProxy] dropping secret-shaped env "${k}" from extraEnv — secrets must stay runner-side`)
        continue
      }
      safe[k] = v
    }
    return { extraEnv: Object.keys(safe).length > 0 ? safe : undefined }
  }

  getActiveStatuses(): Map<string, SessionStatus> {
    return this._getActiveStatuses()
  }

  private hasObservedActiveTurn(chatId: string): boolean {
    return this._getActiveStatuses().has(chatId)
  }

  private hasActiveOrJustStartedTurn(chatId: string): boolean {
    return this.hasObservedActiveTurn(chatId) || this.recentlyStartedChats.has(chatId)
  }

  private async sendCommand(cmd: string, payload: unknown, runnerId: string): Promise<unknown> {
    // Gate: incompatible runners must not receive start_turn — fail fast with a clear message.
    // Fail CLOSED: if no readiness source is wired we cannot prove compatibility, so refuse
    // rather than silently dispatching to a possibly-incompatible runner.
    if (cmd === "start_turn") {
      if (!this._getRunnerReadiness) {
        throw new Error(
          `RunnerProxy ${runnerId}: getRunnerReadiness not provided — refusing start_turn (cannot enforce the compatibility gate)`,
        )
      }
      const { incompatible, protocolVersion, capabilities } = this._getRunnerReadiness(runnerId)
      if (incompatible) {
        throw new Error(
          `Runner ${runnerId} is incompatible (protocol v${protocolVersion ?? "unknown"}, server supports v${SUPPORTED_RANGE.min}–${SUPPORTED_RANGE.max}) — run tinkaria-runner upgrade`,
        )
      }
      // Capability gate: if the runner advertised capabilities, verify the
      // requested provider is installed. If capabilities is null/undefined (not
      // yet probed — e.g. pre-PR4 runner), skip and allow (fail open for
      // backward compat with runners that haven't registered capabilities yet).
      if (capabilities) {
        const turn = payload as { provider?: AgentProvider }
        const requestedProvider = turn.provider
        if (requestedProvider && !capabilities.providers.includes(requestedProvider)) {
          const installed = capabilities.providers.join(", ") || "none"
          console.warn(
            `[RunnerProxy] capability gate: runner ${runnerId} cannot run provider="${requestedProvider}" (installed: ${installed})`,
          )
          throw new Error(
            `Runner ${runnerId} cannot run ${requestedProvider} (installed: ${installed}) — install it on the runner or pick another`,
          )
        }
      }
    }

    // A claude-pty first turn runs a one-time PTY spawn + security smoke-probe
    // that can legitimately take up to ~65s on a cold cache. The runner only
    // replies once startTurn (and thus the spawn) resolves, so the default 10s
    // window expires while the runner is still spawning — the request then
    // fails with a generic NATS "timeout" even though the turn proceeds and
    // streams via events. Give claude-pty start_turn a window that covers the
    // worst-case probe so the real outcome (success or the actual refusal
    // reason) propagates. Other providers/commands keep fast failure detection.
    const isPtyStartTurn = cmd === "start_turn"
      && (payload as { provider?: string } | null)?.provider === "claude-pty"
    const reply = await this.nc.request(
      runnerCmdSubject(runnerId, cmd),
      encoder.encode(JSON.stringify(payload)),
      { timeout: isPtyStartTurn ? 90_000 : 10_000 },
    )
    const response = JSON.parse(decoder.decode(reply.data))
    if (!response.ok) throw new Error(response.error ?? "Runner command failed")
    return response.result
  }

  /**
   * PR5: Resolve which runner should handle the next turn for this chat.
   *
   * - No router → legacy single-runner path: return `{ runnerId: this.runnerId, shouldPersist: false }`.
   * - Router present → consult it with the chat's sticky pin (if any):
   *   - `selected` → return `{ runnerId, shouldPersist: runnerId !== chat.runnerId }`.
   *   - `needs_pick` with no candidates → fail-fast (no eligible runners at all).
   *   - `needs_pick` with candidates → throw RunnerPickRequired for the picker.
   *   - `unavailable` → fail-fast Error.
   *
   * NOTE: does NOT persist the pin — callers must call `store.setChatRunner` after
   * a successful dispatch when `shouldPersist` is true.
   */
  private async resolveRunnerForChat(chatId: string, provider: AgentProvider): Promise<{ runnerId: string; shouldPersist: boolean }> {
    if (!this.router) {
      return { runnerId: this.runnerId, shouldPersist: false }
    }

    const chat = this.store.requireChat(chatId)
    const preferred = chat.runnerId ?? null
    const sel = await this.router.select({ provider, preferredRunnerId: preferred })

    if (sel.kind === "selected") {
      const shouldPersist = sel.runnerId !== (chat.runnerId ?? null)
      return { runnerId: sel.runnerId, shouldPersist }
    }

    if (sel.kind === "needs_pick") {
      if (sel.candidates.length === 0) {
        throw new Error(
          `No eligible runners for provider "${provider}" — start or pair a runner`,
        )
      }
      throw new RunnerPickRequired({ chatId, candidates: sel.candidates, reason: sel.reason })
    }

    // unavailable
    throw new Error(sel.reason)
  }

  /**
   * For non-start commands (cancel, respond_tool, stop_chat_pty) the runner
   * MUST be the already-pinned one — never re-route mid-session. If the chat
   * has no pin yet (e.g. being disposed before any turn) fall back to the
   * shared/default runner.
   */
  private pinnedRunnerForChat(chatId: string): string {
    const chat = this.store.requireChat(chatId)
    return chat.runnerId ?? this._sharedRunnerId()
  }

  /** Send a chat message — creates chat if needed, delegates turn to runner */
  async send(command: ChatSendCommand): Promise<{ chatId: string }> {
    let chatId = command.chatId
    if (!chatId) {
      if (!command.workspaceId) throw new Error("Missing workspaceId for new chat")
      const created = await this.store.createChat(command.workspaceId)
      chatId = created.id
    }

    const chat = this.store.requireChat(chatId)
    const provider = chat.provider ?? command.provider ?? "claude"

    const dynamicCatalog = this.runtimeRegistry
      ? deriveServerProviderCatalog(this.runtimeRegistry.getProviderCapabilities("claude"))
      : undefined
    const catalog = getServerProviderCatalog(provider)
    let model: string
    let planMode: boolean

    if (provider === "claude") {
      model = normalizeServerModel(provider, command.model, dynamicCatalog)
      const modelOptions = normalizeClaudeModelOptions(model, command.modelOptions, command.effort)
      model = resolveClaudeApiModelId(model, modelOptions.contextWindow)
      planMode = catalog.supportsPlanMode ? Boolean(command.planMode) : false
    } else {
      model = normalizeServerModel(provider, command.model, dynamicCatalog)
      planMode = catalog.supportsPlanMode ? Boolean(command.planMode) : false
    }

    const project = this.store.getProject(chat.workspaceId)
    if (!project) throw new Error("Project not found")

    const existingMessages = await this.store.getMessages(chatId)
    const profileOverrides = this.resolveProfileOverrides(chat.workspaceId, provider)

    const startCmd: StartTurnCommand = {
      chatId,
      provider,
      content: command.content,
      model,
      planMode,
      appendUserPrompt: true,
      workspaceLocalPath: project.localPath,
      sessionToken: chat.sessionToken,
      chatTitle: chat.title,
      existingMessageCount: existingMessages.length,
      workspaceId: chat.workspaceId,
      ...profileOverrides,
    }

    if (chat.provider !== provider) {
      if (chat.sessionToken) {
        await this.store.setSessionToken(chatId, null)
      }
      await this.store.setChatProvider(chatId, provider)
    }
    await this.store.setChatModel(chatId, model)
    await this.store.setPlanMode(chatId, planMode)

    const { runnerId, shouldPersist } = await this.resolveRunnerForChat(chatId, provider)
    await this.sendCommand("start_turn", startCmd, runnerId)
    if (shouldPersist) await this.store.setChatRunner(chatId, runnerId)
    this.recentlyStartedChats.add(chatId)
    return { chatId }
  }

  async queue(command: ChatQueueCommand): Promise<{ chatId: string; queued: boolean }> {
    if (!this.hasActiveOrJustStartedTurn(command.chatId)) {
      await this.send({
        ...command,
        type: "chat.send",
      })
      return { chatId: command.chatId, queued: false }
    }

    await this.store.enqueueQueuedTurn({
      chatId: command.chatId,
      provider: command.provider,
      content: command.content,
      model: command.model,
      modelOptions: command.modelOptions,
      effort: command.effort,
      planMode: command.planMode,
    })
    return { chatId: command.chatId, queued: true }
  }

  async drainQueuedTurn(chatId: string): Promise<boolean> {
    this.recentlyStartedChats.delete(chatId)
    if (this.hasObservedActiveTurn(chatId)) return false

    const queued = this.store.getQueuedTurn(chatId)
    if (!queued) return false

    await this.store.clearQueuedTurn(chatId)
    try {
      await this.send({
        type: "chat.send",
        chatId,
        provider: queued.provider,
        content: queued.content,
        model: queued.model,
        modelOptions: queued.modelOptions,
        effort: queued.effort,
        planMode: queued.planMode,
      })
      return true
    } catch (error) {
      await this.store.enqueueQueuedTurn(queued)
      throw error
    }
  }

  /** Resume parent chat after a delegated child agent completes */
  async drainDelegationResult(chatId: string, delegationId: string): Promise<boolean> {
    if (this.hasObservedActiveTurn(chatId)) return false

    const queued = this.store.getQueuedTurn(chatId)
    if (queued) return false

    const chat = this.store.requireChat(chatId)
    const project = this.store.getProject(chat.workspaceId)
    if (!project) throw new Error("Project not found")

    const provider = chat.provider ?? "claude"
    const profileOverrides = this.resolveProfileOverrides(chat.workspaceId, provider)
    const existingMessages = await this.store.getMessages(chatId)

    const startCmd: StartTurnCommand = {
      chatId,
      provider,
      content: `[Delegation result ready] The delegated agent has completed. Review the agent_result entry above and continue.`,
      model: chat.model ?? "sonnet",
      planMode: chat.planMode ?? false,
      appendUserPrompt: false,
      workspaceLocalPath: project.localPath,
      sessionToken: chat.sessionToken,
      chatTitle: chat.title,
      existingMessageCount: existingMessages.length,
      workspaceId: chat.workspaceId,
      ...profileOverrides,
    }

    const { runnerId, shouldPersist } = await this.resolveRunnerForChat(chatId, provider)
    await this.sendCommand("start_turn", startCmd, runnerId)
    if (shouldPersist) await this.store.setChatRunner(chatId, runnerId)
    this.recentlyStartedChats.add(chatId)
    return true
  }

  /** Start a turn for a specific chat — used by orchestration */
  async startTurnForChat(args: {
    chatId: string
    provider: AgentProvider
    content: string
    delegatedContext?: string
    isSpawned?: boolean
    model: string
    effort?: string
    serviceTier?: "fast"
    planMode: boolean
    appendUserPrompt: boolean
  }): Promise<void> {
    const chat = this.store.requireChat(args.chatId)
    const project = this.store.getProject(chat.workspaceId)
    if (!project) throw new Error("Project not found")

    if (chat.provider !== args.provider) {
      if (chat.sessionToken) {
        await this.store.setSessionToken(args.chatId, null)
      }
      await this.store.setChatProvider(args.chatId, args.provider)
    }
    await this.store.setChatModel(args.chatId, args.model)
    await this.store.setPlanMode(args.chatId, args.planMode)

    const profileOverrides = this.resolveProfileOverrides(chat.workspaceId, args.provider)
    const startCmd: StartTurnCommand = {
      chatId: args.chatId,
      provider: args.provider,
      content: args.content,
      delegatedContext: args.delegatedContext,
      isSpawned: args.isSpawned,
      model: args.model,
      planMode: args.planMode,
      appendUserPrompt: args.appendUserPrompt,
      workspaceLocalPath: project.localPath,
      sessionToken: chat.sessionToken,
      chatTitle: chat.title,
      existingMessageCount: (await this.store.getMessages(args.chatId)).length,
      workspaceId: chat.workspaceId,
      ...profileOverrides,
    }
    const { runnerId, shouldPersist } = await this.resolveRunnerForChat(args.chatId, args.provider)
    await this.sendCommand("start_turn", startCmd, runnerId)
    if (shouldPersist) await this.store.setChatRunner(args.chatId, runnerId)
    this.recentlyStartedChats.add(args.chatId)
  }

  async cancel(chatId: string): Promise<void> {
    const runnerId = this.pinnedRunnerForChat(chatId)
    await this.sendCommand("cancel_turn", { chatId }, runnerId)
  }

  async respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void> {
    const runnerId = this.pinnedRunnerForChat(command.chatId)
    await this.sendCommand("respond_tool", {
      chatId: command.chatId,
      toolUseId: command.toolUseId,
      result: command.result,
    }, runnerId)
  }

  async disposeChat(chatId: string): Promise<void> {
    const runnerId = this.pinnedRunnerForChat(chatId)
    try {
      await this.sendCommand("cancel_turn", { chatId }, runnerId)
    } catch (_error) {
      // Chat might not be running — swallow
    }
    // Tear down any long-lived claude-pty session for this chat. Cancel
    // above only sends ^C to the active turn (preserving the session for
    // a follow-up prompt). A chat being deleted must release the claude
    // CLI child + MCP HTTP server + file watcher + memory sampler + OAuth
    // pool reservation. Mirrors kanna's `closeChat` discipline.
    try {
      await this.sendCommand("stop_chat_pty", { chatId }, runnerId)
    } catch (_error) {
      // Runner may have already cleared the session — swallow
    }
  }
}

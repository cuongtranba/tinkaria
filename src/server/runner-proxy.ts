import type { NatsConnection } from "@nats-io/transport-node"
import type { ClientCommand } from "../shared/protocol"
import type { ProviderProfileRecord } from "../shared/profile-types"
import { resolveProfile } from "../shared/profile-types"
import type { AgentProvider, SessionStatus, PendingToolSnapshot } from "../shared/types"
import { resolveClaudeApiModelId } from "../shared/types"
import { runnerCmdSubject, SUPPORTED_RANGE, type RunnerCapabilities, type StartTurnCommand } from "../shared/runner-protocol"
import type { EventStore } from "./event-store"
import type { RuntimeRegistry } from "./runtime-registry"
import {
  deriveServerProviderCatalog,
  getServerProviderCatalog,
  normalizeClaudeModelOptions,
  normalizeServerModel,
} from "./provider-catalog"

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
  /** Optional: called before start_turn dispatch to enforce the protocol-version + capability gate. */
  getRunnerReadiness?: () => { incompatible: boolean; protocolVersion: number | null; capabilities?: RunnerCapabilities | null }
}

export class RunnerProxy {
  private readonly nc: NatsConnection
  private readonly store: EventStore
  private readonly runnerId: string
  private readonly _getActiveStatuses: () => Map<string, SessionStatus>
  private readonly runtimeRegistry: RuntimeRegistry | null
  private readonly _getRunnerReadiness: (() => { incompatible: boolean; protocolVersion: number | null; capabilities?: RunnerCapabilities | null }) | null
  private readonly recentlyStartedChats = new Set<string>()

  /** Orchestration compatibility: check if a chat has an active turn */
  readonly activeTurns: { has(chatId: string): boolean }

  constructor(options: RunnerProxyOptions) {
    this.nc = options.nc
    this.store = options.store
    this.runnerId = options.runnerId
    this._getActiveStatuses = options.getActiveStatuses
    this.runtimeRegistry = options.runtimeRegistry ?? null
    this._getRunnerReadiness = options.getRunnerReadiness ?? null
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

  private async sendCommand(cmd: string, payload: unknown): Promise<unknown> {
    // Gate: incompatible runners must not receive start_turn — fail fast with a clear message.
    // Fail CLOSED: if no readiness source is wired we cannot prove compatibility, so refuse
    // rather than silently dispatching to a possibly-incompatible runner.
    if (cmd === "start_turn") {
      if (!this._getRunnerReadiness) {
        throw new Error(
          `RunnerProxy ${this.runnerId}: getRunnerReadiness not provided — refusing start_turn (cannot enforce the compatibility gate)`,
        )
      }
      const { incompatible, protocolVersion, capabilities } = this._getRunnerReadiness()
      if (incompatible) {
        throw new Error(
          `Runner ${this.runnerId} is incompatible (protocol v${protocolVersion ?? "unknown"}, server supports v${SUPPORTED_RANGE.min}–${SUPPORTED_RANGE.max}) — run tinkaria-runner upgrade`,
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
            `[RunnerProxy] capability gate: runner ${this.runnerId} cannot run provider="${requestedProvider}" (installed: ${installed})`,
          )
          throw new Error(
            `Runner ${this.runnerId} cannot run ${requestedProvider} (installed: ${installed}) — install it on the runner or pick another`,
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
      runnerCmdSubject(this.runnerId, cmd),
      encoder.encode(JSON.stringify(payload)),
      { timeout: isPtyStartTurn ? 90_000 : 10_000 },
    )
    const response = JSON.parse(decoder.decode(reply.data))
    if (!response.ok) throw new Error(response.error ?? "Runner command failed")
    return response.result
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

    await this.sendCommand("start_turn", startCmd)
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

    const profileOverrides = this.resolveProfileOverrides(chat.workspaceId, chat.provider ?? "claude")
    const existingMessages = await this.store.getMessages(chatId)

    const startCmd: StartTurnCommand = {
      chatId,
      provider: chat.provider ?? "claude",
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

    await this.sendCommand("start_turn", startCmd)
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
    await this.sendCommand("start_turn", startCmd)
    this.recentlyStartedChats.add(args.chatId)
  }

  async cancel(chatId: string): Promise<void> {
    await this.sendCommand("cancel_turn", { chatId })
  }

  async respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void> {
    await this.sendCommand("respond_tool", {
      chatId: command.chatId,
      toolUseId: command.toolUseId,
      result: command.result,
    })
  }

  async disposeChat(chatId: string): Promise<void> {
    try {
      await this.cancel(chatId)
    } catch (_error) {
      // Chat might not be running — swallow
    }
    // Tear down any long-lived claude-pty session for this chat. Cancel
    // above only sends ^C to the active turn (preserving the session for
    // a follow-up prompt). A chat being deleted must release the claude
    // CLI child + MCP HTTP server + file watcher + memory sampler + OAuth
    // pool reservation. Mirrors kanna's `closeChat` discipline.
    try {
      await this.sendCommand("stop_chat_pty", { chatId })
    } catch (_error) {
      // Runner may have already cleared the session — swallow
    }
  }
}

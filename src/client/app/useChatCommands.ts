import { useState } from "react"
import type { useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import type {
  AgentProvider,
  AskUserQuestionAnswerMap,
  AskUserQuestionItem,
  ChatRuntime,
  ClaudeModelOptions,
  CodexModelOptions,
  ModelOptions,
  UpdateInstallResult,
  UpdateSnapshot,
} from "../../shared/types"
import {
  getProviderCatalog,
  normalizeClaudeContextWindow,
  resolveClaudeApiModelId,
} from "../../shared/types"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import { useChatInputStore } from "../stores/chatInputStore"
import { useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useRightSidebarStore } from "../stores/rightSidebarStore"
import type { ChatSnapshot, LocalWorkspacesSnapshot, SidebarChatRow, SidebarData, TranscriptRenderUnit } from "../../shared/types"
import type { LocalFilePreview } from "../components/messages/LocalFilePreviewDialog"
import type { useAppDialog } from "../components/ui/app-dialog"
import { deleteCachedChat } from "./chatCache"
import { generateUUID } from "../lib/utils"
import {
  clearPendingSessionBootstrapAfterAttempt,
  deriveForkSessionPreviewTitle,
  deriveMergeSessionPreviewTitle,
  getNewestRemainingChatId,
  getSidebarChatLabels,
  getSidebarChatRow,
  normalizeLocalFilePreviewErrorMessage,
  normalizeSessionBootstrapErrorMessage,
  removeChatFromSidebar,
  resolveComposeIntent,
  shouldQueueChatSubmit,
  summarizeSessionBootstrapIntent,
  transitionPendingSessionBootstrapToError,
  type PendingSessionBootstrap,
  type ProjectRequest,
  type StartChatIntent,
} from "./appState.helpers"
import type { AppTransport } from "./socket-interface"
import type { SubmitPipelineState } from "./useAppState.machine"
import {
  completeDirectSubmit,
  clearQueuedSubmit,
  failDirectSubmit,
  getSubmitPipelineMode,
  markPostFlushBusyObserved,
  startDirectSubmit,
  syncServerQueuedSubmit,
  transitionProjectSelection,
  queueSubmit as queueSubmitTransition,
} from "./useAppState.machine"
import { isProcessingStatus } from "./derived"

// ── Runner pick types (PR5) ───────────────────────────────────────────────────

/** Minimal runner descriptor shape the client needs for the picker. Mirrors server RunnerDescriptor. */
export interface ClientRunnerDescriptor {
  runnerId: string
  state: "online" | "degraded" | "offline"
  capabilities: { providers: string[] } | null
  isShared: boolean
}

/** Pending runner pick request: user must choose before the send is retried. */
export interface RunnerPickRequest {
  chatId: string
  candidates: ClientRunnerDescriptor[]
  reason: "ambiguous" | "sticky_offline"
  /** Retry the original send with the given runnerId after the user picks. */
  retry: (runnerId: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────

const UI_UPDATE_RESTART_STORAGE_KEY = "tinkaria:ui-update-restart"

function getUiUpdateRestartPhase() {
  return window.sessionStorage.getItem(UI_UPDATE_RESTART_STORAGE_KEY)
}

function setUiUpdateRestartPhase(phase: "awaiting_disconnect" | "awaiting_reconnect") {
  window.sessionStorage.setItem(UI_UPDATE_RESTART_STORAGE_KEY, phase)
}

function clearUiUpdateRestartPhase() {
  window.sessionStorage.removeItem(UI_UPDATE_RESTART_STORAGE_KEY)
}

export { getUiUpdateRestartPhase, setUiUpdateRestartPhase, clearUiUpdateRestartPhase, UI_UPDATE_RESTART_STORAGE_KEY }

export interface SubmitOptions {
  provider?: AgentProvider
  model?: string
  modelOptions?: ModelOptions
  planMode?: boolean
}

function resolveRequestedProvider(runtime: ChatRuntime | null, options?: SubmitOptions): AgentProvider | null {
  return runtime?.provider ?? options?.provider ?? null
}

export function resolveRequestedSessionModel(runtime: ChatRuntime | null, options?: SubmitOptions): string | null {
  const provider = resolveRequestedProvider(runtime, options)
  if (!provider) return null

  if (!options?.model) {
    return runtime?.provider === provider ? runtime.model : null
  }

  if (provider === "claude") {
    const baseModel = options.model ?? getProviderCatalog("claude").defaultModel
    const contextWindow = normalizeClaudeContextWindow(
      baseModel,
      options?.modelOptions?.claude?.contextWindow,
    )
    return resolveClaudeApiModelId(baseModel, contextWindow)
  }

  return options?.model ?? getProviderCatalog("codex").defaultModel
}

export function shouldForkForIncompatibleSessionTarget(runtime: ChatRuntime | null, options?: SubmitOptions): boolean {
  if (!runtime?.sessionToken || !runtime.provider) return false

  const requestedProvider = resolveRequestedProvider(runtime, options)
  if (!requestedProvider) return false
  if (requestedProvider !== runtime.provider) return true

  const requestedModel = resolveRequestedSessionModel(runtime, options)
  if (!requestedModel) return false
  if (!runtime.model) return true

  return requestedModel !== runtime.model
}

export interface ChatCommandsArgs {
  socket: AppTransport
  activeChatId: string | null
  navigate: ReturnType<typeof useNavigate>
  dialog: ReturnType<typeof useAppDialog>
  sidebarData: SidebarData
  chatSnapshot: ChatSnapshot | null
  runtime: ChatSnapshot["runtime"] | null
  selectedProjectId: string | null
  fallbackLocalProjectPath: string | null
  isProcessing: boolean
  messages: TranscriptRenderUnit[]
  localProjects: LocalWorkspacesSnapshot | null
  setProjectSelection: React.Dispatch<React.SetStateAction<import("./useAppState.machine").ProjectSelectionState>>
  setSidebarData: React.Dispatch<React.SetStateAction<SidebarData>>
  setPendingChatId: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setCommandError: (error: string | null) => void
  setNormalizedCommandError: (error: unknown) => void
  scrollFollowToBottom: (behavior?: ScrollBehavior) => void
  keepComposerSubmitAnchored: () => void
  activeQueuedText: string
  updateSubmitPipeline: (updater: (current: SubmitPipelineState) => SubmitPipelineState) => SubmitPipelineState
  submitPipeline: SubmitPipelineState
  pendingDeletedChatIdsRef: React.MutableRefObject<Set<string>>
}

export interface ChatCommandsReturn {
  // State
  localFilePreview: LocalFilePreview | null
  startingLocalPath: string | null
  pendingSessionBootstrap: PendingSessionBootstrap | null
  pendingMergeProjectId: string | null
  /** Non-null when the server needs the user to pick a runner before the send is retried. */
  needsPickRequest: RunnerPickRequest | null
  clearNeedsPickRequest: () => void
  // Handlers
  handleCreateChat: (workspaceId: string) => Promise<void>
  handleOpenLocalProject: (localPath: string) => Promise<void>
  handleCreateProject: (project: ProjectRequest) => Promise<void>
  handleCheckForUpdates: (options?: { force?: boolean }) => Promise<void>
  handleInstallUpdate: () => Promise<void>
  handleSend: (content: string, options?: SubmitOptions) => Promise<void>
  handleSubmitFromComposer: (
    content: string,
    options?: SubmitOptions
  ) => Promise<"queued" | "sent">
  handleCancel: () => Promise<void>
  handleDeleteChat: (chat: SidebarChatRow) => Promise<void>
  handleRenameChat: (chatId: string, title: string) => Promise<void>
  handleRemoveProject: (workspaceId: string) => Promise<void>
  handleCreateWorkspace: (name: string) => Promise<void>
  handleDeleteWorkspace: (workspaceId: string) => Promise<void>
  handleRenameWorkspace: (workspaceId: string, name: string) => Promise<void>
  handleTogglePinWorkspace: (workspaceId: string, pinned: boolean) => Promise<void>
  handleReorderWorkspaces: (orderedWorkspaceIds: string[]) => Promise<void>
  handleOpenExternal: (action: "open_finder") => Promise<void>
  handleOpenExternalPath: (action: "open_finder", localPath: string) => Promise<void>
  handleOpenLocalLink: (target: { path: string; line?: number; column?: number }) => Promise<void>
  handleOpenExternalLink: (href: string) => boolean
  closeLocalFilePreview: () => void
  handleCompose: () => void
  handleForkSession: (intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
  handleMergeSession: (chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string, closeSources?: boolean) => Promise<void>
  dismissBootstrapError: () => void
  requestMerge: (workspaceId: string) => void
  clearMergeRequest: () => void
  handleAskUserQuestion: (
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) => Promise<void>
  handleExitPlanMode: (
    toolUseId: string,
    confirmed: boolean,
    clearContext?: boolean,
    message?: string
  ) => Promise<void>

  // For useAppState subscription effect — command handlers update the submit pipeline
  // when snapshots arrive.
  updateSubmitPipelineFromSnapshot: (snapshot: ChatSnapshot) => void
}

export function useChatCommands(args: ChatCommandsArgs): ChatCommandsReturn {
  const {
    socket,
    activeChatId,
    navigate,
    dialog,
    sidebarData,
    chatSnapshot,
    runtime,
    selectedProjectId,
    fallbackLocalProjectPath,
    isProcessing,
    localProjects,
    setProjectSelection,
    setSidebarData,
    setPendingChatId,
    setSidebarOpen,
    setCommandError,
    scrollFollowToBottom,
    keepComposerSubmitAnchored,
    activeQueuedText,
    updateSubmitPipeline,
    submitPipeline,
    pendingDeletedChatIdsRef,
  } = args

  // --- State owned by command handlers ---

  const [localFilePreview, setLocalFilePreview] = useState<LocalFilePreview | null>(null)
  const [startingLocalPath, setStartingLocalPath] = useState<string | null>(null)
  const [pendingMergeProjectId, setPendingMergeProjectId] = useState<string | null>(null)
  const [pendingSessionBootstrap, setPendingSessionBootstrap] = useState<PendingSessionBootstrap | null>(null)
  // PR5: runner pick request — non-null when server returns needsPick before a send
  const [needsPickRequest, setNeedsPickRequest] = useState<RunnerPickRequest | null>(null)
  // --- Internal helpers ---

  function updateSubmitPipelineFromSnapshot(snapshot: ChatSnapshot) {
    if (isProcessingStatus(snapshot.runtime.status)) {
      updateSubmitPipeline((current) => markPostFlushBusyObserved(current, snapshot.runtime.chatId))
    }
    const queuedTurn = snapshot.queuedTurn
    if (queuedTurn) {
      updateSubmitPipeline((current) => syncServerQueuedSubmit(current, {
        chatId: snapshot.runtime.chatId,
        content: queuedTurn.content,
        options: {
          provider: queuedTurn.provider,
          model: queuedTurn.model,
          modelOptions: queuedTurn.modelOptions,
          planMode: queuedTurn.planMode,
        },
      }))
    } else if (!isProcessingStatus(snapshot.runtime.status)) {
      updateSubmitPipeline((current) => syncServerQueuedSubmit(current, {
        chatId: snapshot.runtime.chatId,
        content: null,
      }))
    }
  }

  async function openExternal(command: {
    action: "open_finder"
    localPath: string
  }) {
    setCommandError(null)
    await socket.command({
      type: "system.openExternal",
      ...command,
    })
  }

  async function createChatForProject(workspaceId: string) {
    useChatPreferencesStore.getState().initializeComposerForNewChat()
    const optimisticChatId = generateUUID()
    setProjectSelection((current) => transitionProjectSelection(current, {
      type: "project.explicitly_selected",
      workspaceId,
    }))
    setPendingChatId(optimisticChatId)
    navigate(`/chat/${optimisticChatId}`)
    setSidebarOpen(false)
    try {
      const result = await socket.command<{ chatId: string }>({
        type: "chat.create",
        workspaceId,
        chatId: optimisticChatId,
      })
      if (result.chatId !== optimisticChatId) {
        setPendingChatId(result.chatId)
        navigate(`/chat/${result.chatId}`, { replace: true })
      }
      setCommandError(null)
    } catch (error) {
      setPendingChatId(null)
      navigate(activeChatId ? `/chat/${activeChatId}` : "/")
      throw error
    }
  }

  async function resolveProjectIdForStartChat(intent: StartChatIntent): Promise<{ workspaceId: string; localPath?: string }> {
    if (intent.kind === "project_id") {
      return { workspaceId: intent.workspaceId }
    }

    if (intent.kind === "local_path") {
      const result = await socket.command<{ workspaceId: string }>({ type: "project.open", localPath: intent.localPath })
      return { workspaceId: result.workspaceId, localPath: intent.localPath }
    }

    const result = await socket.command<{ workspaceId: string }>(
      intent.project.mode === "new"
        ? { type: "project.create", localPath: intent.project.localPath, title: intent.project.title }
        : { type: "project.open", localPath: intent.project.localPath }
    )
    return { workspaceId: result.workspaceId, localPath: intent.project.localPath }
  }

  async function startChatFromIntent(intent: StartChatIntent) {
    try {
      const localPath = intent.kind === "project_id"
        ? null
        : intent.kind === "local_path"
          ? intent.localPath
          : intent.project.localPath
      if (localPath) {
        setStartingLocalPath(localPath)
      }

      const { workspaceId } = await resolveProjectIdForStartChat(intent)
      await createChatForProject(workspaceId)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    } finally {
      setStartingLocalPath(null)
    }
  }

  // --- Navigation/creation commands ---

  async function handleCreateChat(workspaceId: string) {
    await startChatFromIntent({ kind: "project_id", workspaceId })
  }

  async function handleOpenLocalProject(localPath: string) {
    await startChatFromIntent({ kind: "local_path", localPath })
  }

  async function handleCreateProject(project: ProjectRequest) {
    await startChatFromIntent({ kind: "project_request", project })
  }

  function handleCompose() {
    const intent = resolveComposeIntent({
      selectedProjectId,
      sidebarProjectId: sidebarData.workspaceGroups[0]?.groupKey,
      fallbackLocalProjectPath,
    })
    if (intent) {
      void startChatFromIntent(intent)
      return
    }

    navigate("/")
  }

  // --- Chat lifecycle commands ---

  async function handleSend(content: string, options?: SubmitOptions) {
    try {
      let workspaceId = selectedProjectId ?? sidebarData.workspaceGroups[0]?.groupKey ?? null
      if (!activeChatId && !workspaceId && fallbackLocalProjectPath) {
        const project = await socket.command<{ workspaceId: string }>({
          type: "project.open",
          localPath: fallbackLocalProjectPath,
        })
        workspaceId = project.workspaceId
        setProjectSelection((current) => transitionProjectSelection(current, {
          type: "project.explicitly_selected",
          workspaceId,
        }))
      }

      if (!activeChatId && !workspaceId) {
        throw new Error("Open a project first")
      }

      if (activeChatId && shouldForkForIncompatibleSessionTarget(runtime, options)) {
        const forkProvider = resolveRequestedProvider(runtime, options) ?? "claude"
        const forkModel = resolveRequestedSessionModel(runtime, options) ?? getProviderCatalog(forkProvider).defaultModel
        await handleForkSession(content, forkProvider, forkModel, undefined, {
          modelOptions: options?.modelOptions,
          planMode: options?.planMode,
        })
        setCommandError(null)
        return
      }

      scrollFollowToBottom("auto")

      // A claude-pty first turn triggers a one-time PTY spawn + smoke-probe on
      // the runner that can take up to ~65s on a cold cache. Use a window
      // slightly longer than the server→runner start_turn timeout (90s) so the
      // server's real outcome (success or the actual error) wins the race
      // instead of the client surfacing a premature generic "timeout".
      const sendTimeoutMs = options?.provider === "claude-pty" ? 95_000 : undefined
      const sendCommandOptions = sendTimeoutMs ? { timeoutMs: sendTimeoutMs } : undefined
      const sendPayload = {
        type: "chat.send" as const,
        chatId: activeChatId ?? undefined,
        workspaceId: activeChatId ? undefined : workspaceId ?? undefined,
        provider: options?.provider,
        content,
        model: options?.model,
        modelOptions: options?.modelOptions,
        planMode: options?.planMode,
      }

      type SendResult = { chatId?: string } | { needsPick: true; chatId: string; candidates: ClientRunnerDescriptor[]; reason: "ambiguous" | "sticky_offline" }
      const result = await socket.command<SendResult>(sendPayload, sendCommandOptions)

      if ("needsPick" in result && result.needsPick) {
        // Server needs the user to pick a runner. Surface the picker; the retry
        // callback will be called by the dialog after the user picks.
        const doRetry = async (runnerId: string) => {
          await socket.command({ type: "chat.selectRunner", chatId: result.chatId, runnerId })
          // Retry the original send now that the runner is pinned
          type RetryResult = { chatId?: string } | { needsPick: true; chatId: string; candidates: ClientRunnerDescriptor[]; reason: "ambiguous" | "sticky_offline" }
          const retryResult = await socket.command<RetryResult>(sendPayload, sendCommandOptions)
          if ("needsPick" in retryResult && retryResult.needsPick) {
            // Picked runner became ineligible — re-open picker with new candidates
            setNeedsPickRequest({
              chatId: retryResult.chatId,
              candidates: retryResult.candidates,
              reason: retryResult.reason,
              retry: doRetry,
            })
            return
          }
          const sendRetryResult = retryResult as { chatId?: string }
          if (!activeChatId && sendRetryResult.chatId) {
            setPendingChatId(sendRetryResult.chatId)
            navigate(`/chat/${sendRetryResult.chatId}`)
          }
        }
        setNeedsPickRequest({
          chatId: result.chatId,
          candidates: result.candidates,
          reason: result.reason,
          retry: doRetry,
        })
        return
      }

      const sendResult = result as { chatId?: string }
      if (!activeChatId && sendResult.chatId) {
        setPendingChatId(sendResult.chatId)
        navigate(`/chat/${sendResult.chatId}`)
      }

      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function handleSubmitFromComposer(
    content: string,
    options?: SubmitOptions
  ) {
    keepComposerSubmitAnchored()

    if (!activeChatId) {
      await handleSend(content, options)
      return "sent" as const
    }

    // Claude-PTY routing: if a live pty instance exists for this chat,
    // bypass chat.send and forward keystrokes via pty.input. The PTY
    // driver owns the turn lifecycle in that mode.
    try {
      const ptyStoreMod = await import("../stores/ptyInstancesStore")
      const ptyClient = await import("../lib/pty-client")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeFactory: any = (ptyStoreMod as any).usePtyInstancesStore ?? (ptyStoreMod as any).default
      const snapshot: { instances?: Array<{ chatId: string }> } | undefined = storeFactory?.getState?.()
      const live = snapshot?.instances?.some((i) => i.chatId === activeChatId) ?? false
      if (live) {
        await ptyClient.ptyInput(socket, activeChatId, content)
        return "sent" as const
      }
    } catch {
      // Store/helper not initialised or no live PTY — fall through.
    }

    if (
      shouldQueueChatSubmit(isProcessing, activeQueuedText)
      || getSubmitPipelineMode(submitPipeline, activeChatId) === "flushing"
      || getSubmitPipelineMode(submitPipeline, activeChatId) === "awaiting_busy_ack"
    ) {
      const queuedState = updateSubmitPipeline((current) => queueSubmitTransition(current, {
        chatId: activeChatId,
        content,
        options: options ?? undefined,
      }))
      const queuedText = queuedState.queuedTextByChat[activeChatId] ?? content
      try {
        type QueueResult = { queued: boolean } | { needsPick: true; chatId: string; candidates: ClientRunnerDescriptor[]; reason: "ambiguous" | "sticky_offline" }
        const result = await socket.command<QueueResult>({
          type: "chat.queue",
          chatId: activeChatId,
          provider: options?.provider,
          content: queuedText,
          model: options?.model,
          modelOptions: options?.modelOptions,
          planMode: options?.planMode,
        })
        if ("needsPick" in result && result.needsPick) {
          const queuePayload = {
            type: "chat.queue" as const,
            chatId: activeChatId,
            provider: options?.provider,
            content: queuedText,
            model: options?.model,
            modelOptions: options?.modelOptions,
            planMode: options?.planMode,
          }
          const doRetry = async (runnerId: string) => {
            await socket.command({ type: "chat.selectRunner", chatId: result.chatId, runnerId })
            type QueueRetryResult = { queued: boolean } | { needsPick: true; chatId: string; candidates: ClientRunnerDescriptor[]; reason: "ambiguous" | "sticky_offline" }
            const retryResult = await socket.command<QueueRetryResult>(queuePayload)
            if ("needsPick" in retryResult && retryResult.needsPick) {
              // Picked runner became ineligible — re-open picker with new candidates
              setNeedsPickRequest({
                chatId: retryResult.chatId,
                candidates: retryResult.candidates,
                reason: retryResult.reason,
                retry: doRetry,
              })
            }
          }
          setNeedsPickRequest({
            chatId: result.chatId,
            candidates: result.candidates,
            reason: result.reason,
            retry: doRetry,
          })
          return "queued" as const
        }
        const queueResult = result as { queued: boolean }
        if (!queueResult.queued) {
          updateSubmitPipeline((current) => clearQueuedSubmit(current, activeChatId))
        }
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error))
        throw error
      }
      return "queued" as const
    }

    updateSubmitPipeline((current) => startDirectSubmit(current, {
      chatId: activeChatId,
      content,
    }))

    try {
      await handleSend(content, options)
      updateSubmitPipeline((current) => completeDirectSubmit(current, activeChatId))
      return "sent" as const
    } catch (error) {
      updateSubmitPipeline((current) => failDirectSubmit(current, activeChatId))
      throw error
    }
  }

  async function handleCancel() {
    if (!activeChatId) return
    try {
      await socket.command({ type: "chat.cancel", chatId: activeChatId })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteChat(chat: SidebarChatRow) {
    const confirmed = await dialog.confirm({
      title: "Delete Chat",
      description: `Delete "${chat.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    // Optimistic: remove from sidebar immediately so the UI feels instant.
    // Compute navigation target *before* updating sidebar state.
    const nextChatId = chat.chatId === activeChatId
      ? getNewestRemainingChatId(sidebarData.workspaceGroups, chat.chatId)
      : null

    // Track as pending-delete so incoming WS snapshots don't re-insert it.
    pendingDeletedChatIdsRef.current.add(chat.chatId)
    setSidebarData((current) => removeChatFromSidebar(current, chat.chatId))
    useChatInputStore.getState().clearQueuedDraft(chat.chatId)
    deleteCachedChat(chat.chatId)

    if (chat.chatId === activeChatId) {
      navigate(nextChatId ? `/chat/${nextChatId}` : "/")
    }

    // Fire-and-forget: server delete runs in the background.
    // The server will push a fresh sidebar snapshot via WS on completion.
    socket.command({ type: "chat.delete", chatId: chat.chatId }).then(() => {
      pendingDeletedChatIdsRef.current.delete(chat.chatId)
    }).catch((error) => {
      // Keep in pending set on failure — sidebar snapshot will be authoritative.
      pendingDeletedChatIdsRef.current.delete(chat.chatId)
      console.warn("[useChatCommands] background chat.delete failed:", error instanceof Error ? error.message : String(error))
    })
  }

  async function handleRenameChat(chatId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await socket.command({ type: "chat.rename", chatId, title: trimmed })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  // --- Project commands ---

  async function handleRemoveProject(workspaceId: string) {
    const project = sidebarData.workspaceGroups.find((group) => group.groupKey === workspaceId)
    if (!project) return
    const projectName = project.localPath.split("/").filter(Boolean).pop() ?? project.localPath
    const confirmed = await dialog.confirm({
      title: "Remove",
      description: `Remove "${projectName}" from the sidebar? Existing chats will be removed from ${APP_NAME}.`,
      confirmLabel: "Remove",
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    try {
      await socket.command({ type: "project.remove", workspaceId })
      for (const chat of project.chats) {
        useChatInputStore.getState().clearQueuedDraft(chat.chatId)
        deleteCachedChat(chat.chatId)
      }
      useTerminalLayoutStore.getState().clearProject(workspaceId)
      useRightSidebarStore.getState().clearProject(workspaceId)
      if (runtime?.workspaceId === workspaceId) {
        navigate("/")
      }
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  // --- Independent workspace commands ---

  async function handleCreateWorkspace(name: string) {
    try {
      const result = await socket.command<{ workspaceId: string }>({ type: "independent-workspace.create", name })
      if (result?.workspaceId) {
        navigate(`/workspace/${result.workspaceId}`)
      }
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    const confirmed = await dialog.confirm({
      title: "Delete Workspace",
      description: "Delete this workspace? This cannot be undone.",
      confirmLabel: "Delete",
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    try {
      await socket.command({ type: "independent-workspace.delete", workspaceId })
      if (window.location.pathname === `/workspace/${workspaceId}`) {
        navigate("/")
      }
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRenameWorkspace(workspaceId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await socket.command({ type: "independent-workspace.rename", workspaceId, name: trimmed })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleTogglePinWorkspace(workspaceId: string, pinned: boolean) {
    try {
      await socket.command({ type: "independent-workspace.set-pinned", workspaceId, pinned })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleReorderWorkspaces(orderedWorkspaceIds: string[]) {
    try {
      await socket.command({ type: "independent-workspace.reorder", orderedWorkspaceIds })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  // --- Update commands ---

  async function handleCheckForUpdates(options?: { force?: boolean }) {
    try {
      await socket.command<UpdateSnapshot>({ type: "update.check", force: options?.force })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleInstallUpdate() {
    try {
      const result = await socket.command<UpdateInstallResult>({ type: "update.install" })
      if (!result.ok) {
        clearUiUpdateRestartPhase()
        setCommandError(null)
        await dialog.alert({
          title: result.userTitle ?? "Update failed",
          description: result.userMessage ?? `${APP_NAME} could not install the update. Try again later.`,
          closeLabel: "OK",
        })
        return
      }

      if (result.ok && result.action === "reload") {
        window.location.reload()
        return
      }

      if (result.ok && result.action === "restart") {
        setUiUpdateRestartPhase("awaiting_disconnect")
      }
      setCommandError(null)
    } catch (error) {
      clearUiUpdateRestartPhase()
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  // --- External link commands ---

  async function handleOpenExternal(action: "open_finder") {
    const localPath = runtime?.localPath ?? localProjects?.workspaces[0]?.localPath ?? sidebarData.workspaceGroups[0]?.localPath
    if (!localPath) return
    try {
      await openExternal({
        action,
        localPath,
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenExternalPath(action: "open_finder", localPath: string) {
    try {
      await openExternal({
        action,
        localPath,
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenLocalLink(target: { path: string; line?: number; column?: number }) {
    try {
      const result = await socket.command<{ localPath: string; content: string }>({
        type: "system.readLocalFilePreview",
        localPath: target.path,
      })
      setLocalFilePreview({
        path: result.localPath,
        content: result.content,
        line: target.line,
        column: target.column,
      })
      setCommandError(null)
    } catch (error) {
      setCommandError(normalizeLocalFilePreviewErrorMessage(error))
    }
  }

  function handleOpenExternalLink(href: string): boolean {
    void href
    return false
  }

  // --- Fork/merge commands ---

  async function handleForkSession(
    intent: string,
    provider: AgentProvider,
    model: string,
    preset?: string,
    overrides?: { modelOptions?: ModelOptions; planMode?: boolean }
  ) {
    if (!activeChatId) {
      throw new Error("Open a chat first")
    }
    const workspaceId = chatSnapshot?.runtime?.workspaceId ?? selectedProjectId ?? sidebarData.workspaceGroups[0]?.groupKey ?? null
    if (!workspaceId) {
      throw new Error("Open a project first")
    }

    const sourceTitle = getSidebarChatRow(sidebarData.workspaceGroups, activeChatId)?.title?.trim() || chatSnapshot?.runtime?.title || activeChatId
    const previewTitle = deriveForkSessionPreviewTitle({
      sourceTitle,
      intent,
    })
    const previewIntent = summarizeSessionBootstrapIntent(intent)
    const { chatId } = await socket.command<{ chatId: string }>({ type: "chat.create", workspaceId })
    await socket.command({
      type: "chat.rename",
      chatId,
      title: previewTitle,
    })
    setPendingChatId(chatId)
    setPendingSessionBootstrap({
      chatId,
      kind: "fork",
      phase: "compacting",
      sourceLabels: [sourceTitle],
      previewTitle,
      previewIntent,
    })
    navigate(`/chat/${chatId}`)
    setSidebarOpen(false)
    setCommandError(null)

    void (async () => {
      try {
        const { prompt } = await socket.command<{ prompt: string }>({
          type: "chat.generateForkPrompt",
          chatId: activeChatId,
          intent,
          preset,
        }, { timeoutMs: 120_000 })
        setPendingSessionBootstrap((current) => current?.chatId === chatId
          ? { ...current, phase: "starting" }
          : current)
        const defaults = useChatPreferencesStore.getState().providerDefaults[provider]
        const modelOptions: ModelOptions = overrides?.modelOptions
          ? provider === "claude"
            ? { claude: { ...(overrides.modelOptions.claude as ClaudeModelOptions | undefined ?? defaults.modelOptions as ClaudeModelOptions) } }
            : { codex: { ...(overrides.modelOptions.codex as CodexModelOptions | undefined ?? defaults.modelOptions as CodexModelOptions) } }
          : provider === "claude"
            ? { claude: { ...defaults.modelOptions as ClaudeModelOptions } }
            : { codex: { ...defaults.modelOptions as CodexModelOptions } }

        await socket.command({
          type: "chat.send",
          chatId,
          provider,
          content: prompt,
          model,
          modelOptions,
          planMode: overrides?.planMode ?? defaults.planMode,
        })
      } catch (error) {
        const message = normalizeSessionBootstrapErrorMessage("fork", error)
        console.warn("[fork] background fork failed:", message)
        setPendingSessionBootstrap((current) => transitionPendingSessionBootstrapToError(current, chatId, message))
      } finally {
        setPendingSessionBootstrap((current) => clearPendingSessionBootstrapAfterAttempt(current, chatId))
      }
    })()
  }

  async function handleMergeSession(chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string, closeSources?: boolean) {
    if (chatIds.length < 1) {
      throw new Error("Select at least 1 session to merge")
    }

    const workspaceId = pendingMergeProjectId ?? selectedProjectId ?? sidebarData.workspaceGroups[0]?.groupKey ?? null
    if (!workspaceId) {
      throw new Error("Open a project first")
    }

    const sourceLabels = getSidebarChatLabels(sidebarData.workspaceGroups, chatIds)
    const previewTitle = deriveMergeSessionPreviewTitle({
      sourceLabels,
      intent,
    })
    const previewIntent = summarizeSessionBootstrapIntent(intent)
    // Step 1: Create chat + navigate instantly
    const { chatId } = await socket.command<{ chatId: string }>({ type: "chat.create", workspaceId })
    await socket.command({
      type: "chat.rename",
      chatId,
      title: previewTitle,
    })
    setPendingChatId(chatId)
    setPendingSessionBootstrap({
      chatId,
      kind: "merge",
      phase: "compacting",
      sourceLabels,
      previewTitle,
      previewIntent,
    })
    navigate(`/chat/${chatId}`)
    setSidebarOpen(false)
    setCommandError(null)

    // Step 2: Background — generate prompt + send + optional cleanup
    void (async () => {
      try {
        const { prompt } = await socket.command<{ prompt: string }>({
          type: "chat.generateMergePrompt", chatIds, intent, preset,
        }, { timeoutMs: 120_000 })
        setPendingSessionBootstrap((current) => current?.chatId === chatId
          ? { ...current, phase: "starting" }
          : current)
        const defaults = useChatPreferencesStore.getState().providerDefaults[provider]
        const modelOptions: ModelOptions = provider === "claude"
          ? { claude: { ...defaults.modelOptions as import("../../shared/types").ClaudeModelOptions } }
          : { codex: { ...defaults.modelOptions as import("../../shared/types").CodexModelOptions } }

        await socket.command({ type: "chat.send", chatId, provider, content: prompt, model, modelOptions })

        if (closeSources) {
          for (const sourceId of chatIds) {
            try {
              await socket.command({ type: "chat.delete", chatId: sourceId })
            } catch (deleteError) {
              console.warn("[merge] failed to delete source chat:", sourceId, deleteError instanceof Error ? deleteError.message : String(deleteError))
            }
          }
        }
      } catch (error) {
        const message = normalizeSessionBootstrapErrorMessage("merge", error)
        console.warn("[merge] background merge failed:", message)
        setPendingSessionBootstrap((current) => transitionPendingSessionBootstrapToError(current, chatId, message))
      } finally {
        setPendingSessionBootstrap((current) => clearPendingSessionBootstrapAfterAttempt(current, chatId))
      }
    })()
  }

  // --- Tool response commands ---

  async function handleAskUserQuestion(
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) {
    if (!activeChatId) return
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId: activeChatId,
        toolUseId,
        result: { questions, answers },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleExitPlanMode(toolUseId: string, confirmed: boolean, clearContext?: boolean, message?: string) {
    if (!activeChatId) return
    if (confirmed) {
      useChatPreferencesStore.getState().setComposerPlanMode(false)
    }
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId: activeChatId,
        toolUseId,
        result: {
          confirmed,
          ...(clearContext ? { clearContext: true } : {}),
          ...(message ? { message } : {}),
        },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    // State
    localFilePreview,
    startingLocalPath,
    pendingSessionBootstrap,
    pendingMergeProjectId,
    needsPickRequest,
    clearNeedsPickRequest: () => setNeedsPickRequest(null),
    // Handlers
    handleCreateChat,
    handleOpenLocalProject,
    handleCreateProject,
    handleCheckForUpdates,
    handleInstallUpdate,
    handleSend,
    handleSubmitFromComposer,
    handleCancel,
    handleDeleteChat,
    handleRenameChat,
    handleRemoveProject,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleRenameWorkspace,
    handleTogglePinWorkspace,
    handleReorderWorkspaces,
    handleOpenExternal,
    handleOpenExternalPath,
    handleOpenLocalLink,
    handleOpenExternalLink,
    closeLocalFilePreview: () => setLocalFilePreview(null),
    handleCompose,
    handleForkSession,
    handleMergeSession,
    dismissBootstrapError: () => setPendingSessionBootstrap(null),
    requestMerge: (workspaceId: string) => setPendingMergeProjectId(workspaceId),
    clearMergeRequest: () => setPendingMergeProjectId(null),
    handleAskUserQuestion,
    handleExitPlanMode,

    // Internal — for useAppState subscription effect
    updateSubmitPipelineFromSnapshot,
  }
}

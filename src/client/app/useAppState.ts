import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "react-router-dom"
import {
  PROVIDERS,
  type AgentProvider,
  type AskUserQuestionAnswerMap,
  type AskUserQuestionItem,
  type CurrentRepoStatusSnapshot,
  type CurrentSessionSnapshot,
  type ModelOptions,
  type OrchestrationHierarchySnapshot,
  type ProviderCatalogEntry,
  type UpdateSnapshot,
} from "../../shared/types"
import { useChatInputStore } from "../stores/chatInputStore"
import type { ChatSnapshot, LocalWorkspacesSnapshot, SidebarChatRow, SidebarData, TranscriptRenderUnit } from "../../shared/types"
import type { LocalFilePreview } from "../components/messages/LocalFilePreviewDialog"
import { useAppDialog } from "../components/ui/app-dialog"
import { useSessionPolling } from "./useSessionPolling"
import { clearChatCache, markCachedChatsStale } from "./chatCache"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
import {
  createProjectSelectionState,
  resolveProjectSelection,
  transitionProjectSelection,
} from "./useAppState.machine"
import { useSubmitPipeline } from "./useSubmitPipeline"
import { NatsSocket } from "./nats-socket"
import type { AppTransport, SocketStatus } from "./socket-interface"
import { usePtyInstancesSubscription } from "./usePtyInstancesSubscription"
import {
  filterPendingDeletedChats,
  getActiveChatSnapshot,
  getSidebarChatRow,
  getUiUpdateRestartReconnectAction,
  normalizeCommandErrorMessage,
  type PendingSessionBootstrap,
  type ProjectRequest,
} from "./appState.helpers"
import { usePwaResume } from "./usePwaResume"
import { useScrollSync } from "./useScrollSync"
import { useTranscriptLifecycle } from "./useTranscriptLifecycle"
import { useChatCommands, getUiUpdateRestartPhase, setUiUpdateRestartPhase, clearUiUpdateRestartPhase, type RunnerPickRequest } from "./useChatCommands"

function useAppSocket(): AppTransport {
  const socketRef = useRef<AppTransport | null>(null)
  if (!socketRef.current) {
    socketRef.current = new NatsSocket()
  }

  useEffect(() => {
    const socket = socketRef.current
    socket?.start()
    return () => {
      socket?.dispose()
    }
  }, [])

  return socketRef.current as AppTransport
}

function logAppState(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[useAppState] ${message}`)
    return
  }

  console.info(`[useAppState] ${message}`, details)
}

export { type CachedChatState, MAX_CACHED_CHATS } from "./chatCache"

export interface AppState {
  socket: AppTransport
  activeChatId: string | null
  sidebarData: SidebarData
  localProjects: LocalWorkspacesSnapshot | null
  updateSnapshot: UpdateSnapshot | null
  chatSnapshot: ChatSnapshot | null
  orchestrationHierarchy: OrchestrationHierarchySnapshot | null
  connectionStatus: SocketStatus
  sidebarReady: boolean
  localProjectsReady: boolean
  commandError: string | null
  startingLocalPath: string | null
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  sentinelRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLDivElement | null>
  messages: TranscriptRenderUnit[]
  latestToolIds: ReturnType<typeof getLatestToolIds>
  runtime: ChatSnapshot["runtime"] | null
  currentSessionRuntime: CurrentSessionSnapshot["runtime"]
  currentRepoStatus: CurrentRepoStatusSnapshot | null
  currentAccountInfo: Extract<TranscriptRenderUnit, { kind: "account_info" }>["message"]["accountInfo"] | null
  availableProviders: ProviderCatalogEntry[]
  isProcessing: boolean
  canCancel: boolean
  queuedText: string
  transcriptPaddingBottom: number
  showScrollButton: boolean
  navbarLocalPath?: string
  hasSelectedProject: boolean
  chatHasKnownMessages: boolean
  localFilePreview: LocalFilePreview | null
  openSidebar: () => void
  closeSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
  closeLocalFilePreview: () => void
  scrollToBottom: () => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
  handleCreateChat: (workspaceId: string) => Promise<void>
  handleOpenLocalProject: (localPath: string) => Promise<void>
  handleCreateProject: (project: ProjectRequest) => Promise<void>
  handleCheckForUpdates: (options?: { force?: boolean }) => Promise<void>
  handleInstallUpdate: () => Promise<void>
  handleSend: (content: string, options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }) => Promise<void>
  handleSubmitFromComposer: (
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<"queued" | "sent">
  handleCancel: () => Promise<void>
  clearQueuedText: () => void
  restoreQueuedText: () => string
  handleDeleteChat: (chat: SidebarChatRow) => Promise<void>
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
  handleRenameChat: (chatId: string, title: string) => Promise<void>
  handleCompose: () => void
  handleForkSession: (intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
  handleMergeSession: (chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string, closeSources?: boolean) => Promise<void>
  pendingSessionBootstrap: PendingSessionBootstrap | null
  dismissBootstrapError: () => void
  pendingMergeProjectId: string | null
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
  clearCommandError: () => void
  /** Non-null when the server needs the user to pick a runner (PR5). */
  needsPickRequest: RunnerPickRequest | null
  clearNeedsPickRequest: () => void
}

export function shouldMarkActiveChatRead(args: {
  activeChatId: string | null
  sidebarReady: boolean
  chatUnread: boolean
  visibilityState: DocumentVisibilityState
  hasFocus: boolean
}): boolean {
  return Boolean(
    args.activeChatId
    && args.sidebarReady
    && args.chatUnread
    && args.visibilityState === "visible"
    && args.hasFocus
  )
}

export function useAppState(activeChatId: string | null): AppState {
  const navigate = useNavigate()
  const socket = useAppSocket()
  const dialog = useAppDialog()

  const [sidebarData, setSidebarData] = useState<SidebarData>({ workspaceGroups: [], independentWorkspaces: [] })
  const [localProjects, setLocalProjects] = useState<LocalWorkspacesSnapshot | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<SocketStatus>("connecting")
  const [sidebarReady, setSidebarReady] = useState(false)
  const [localProjectsReady, setLocalProjectsReady] = useState(false)
  const [projectSelection, setProjectSelection] = useState(createProjectSelectionState)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputHeight, setInputHeight] = useState(148)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [pendingChatId, setPendingChatId] = useState<string | null>(null)
  const {
    submitPipeline,
    activeQueuedText,
    updateSubmitPipeline,
    clearQueuedText,
    restoreQueuedText,
  } = useSubmitPipeline({ activeChatId })

  const inputRef = useRef<HTMLDivElement>(null)
  const setNormalizedCommandError = useCallback((error: unknown) => {
    setCommandError(normalizeCommandErrorMessage(error))
  }, [])
  const snapshotCallbackRef = useRef<(snapshot: ChatSnapshot) => void>(() => {})
  const pendingDeletedChatIdsRef = useRef<Set<string>>(new Set())

  const { resumeRefreshNonce } = usePwaResume({
    socket,
    activeChatId,
    connectionStatus,
    setNormalizedCommandError,
  })

  useEffect(() => socket.onStatus((status) => {
    setConnectionStatus(status)
    if (status === "disconnected") {
      clearChatCache()
    }
  }), [socket])

  usePtyInstancesSubscription(socket, connectionStatus === "connected")

  useEffect(() => {
    return socket.subscribe<SidebarData>({ type: "sidebar" }, (snapshot) => {
      setSidebarData(filterPendingDeletedChats(snapshot, pendingDeletedChatIdsRef.current))
      setProjectSelection((current) => transitionProjectSelection(current, {
        type: "sidebar.loaded",
        firstProjectId: snapshot.workspaceGroups[0]?.groupKey ?? null,
      }))
      useChatInputStore.getState().reconcileQueuedDrafts(
        snapshot.workspaceGroups.flatMap((group) => group.chats.map((chat) => chat.chatId))
      )
      // Mark cached chats as stale when sidebar shows newer lastMessageAt
      const allChats = snapshot.workspaceGroups.flatMap((group) => group.chats)
      markCachedChatsStale(allChats)
      setSidebarReady(true)
      setCommandError(null)
    })
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    return socket.subscribe<LocalWorkspacesSnapshot>({ type: "local-workspaces" }, (snapshot) => {
      setLocalProjects(snapshot)
      setLocalProjectsReady(true)
      setCommandError(null)
    })
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    return socket.subscribe<UpdateSnapshot>({ type: "update" }, (snapshot) => {
      setUpdateSnapshot(snapshot)
      setCommandError(null)
    })
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    if (connectionStatus !== "connected") return
    void socket.command<UpdateSnapshot>({ type: "update.check", force: true }).catch((error) => {
      setNormalizedCommandError(error)
    })
  }, [connectionStatus, setNormalizedCommandError, socket])

  useEffect(() => {
    const phase = getUiUpdateRestartPhase()
    const reconnectAction = getUiUpdateRestartReconnectAction(phase, connectionStatus)
    if (reconnectAction === "awaiting_reconnect") {
      setUiUpdateRestartPhase("awaiting_reconnect")
      return
    }

    if (reconnectAction === "navigate_home") {
      clearUiUpdateRestartPhase()
      navigate("/", { replace: true })
    }
  }, [connectionStatus, navigate])

  useEffect(() => {
    function handleWindowFocus() {
      if (!updateSnapshot?.lastCheckedAt) return
      if (Date.now() - updateSnapshot.lastCheckedAt <= 60 * 60 * 1000) return
      void socket.command<UpdateSnapshot>({ type: "update.check" }).catch((error) => {
        setNormalizedCommandError(error)
      })
    }

    window.addEventListener("focus", handleWindowFocus)
    return () => {
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [setNormalizedCommandError, socket, updateSnapshot?.lastCheckedAt])

  const handleChatSnapshotReceived = useCallback((snapshot: ChatSnapshot) => {
    snapshotCallbackRef.current(snapshot)
  }, [])

  // Ref-based scroll state bridge: useScrollSync populates this, useTranscriptLifecycle reads it.
  // Avoids circular dependency since lifecycle runs first but needs scroll state on departure.
  const scrollStateRef = useRef<{ scrollRef: RefObject<HTMLDivElement | null>; scrollModeRef: RefObject<string> } | null>(null)
  const getScrollState = useCallback(() => {
    const bridge = scrollStateRef.current
    if (!bridge) return null
    const el = bridge.scrollRef.current
    if (!el) return null
    const mode = bridge.scrollModeRef.current
    return {
      scrollTop: el.scrollTop,
      scrollMode: (mode === "detached" ? "detached" : "following") as "following" | "detached",
    }
  }, [])

  const {
    messages,
    chatSnapshot,
    orchestrationHierarchy,
    cachedScrollState,
  } = useTranscriptLifecycle({
    socket,
    activeChatId,
    resumeRefreshNonce,
    sidebarData,
    sidebarReady,
    pendingChatId,
    setPendingChatId,
    navigate,
    setProjectSelection,
    setCommandError,
    onChatSnapshotReceived: handleChatSnapshotReceived,
    getScrollState,
  })

  useLayoutEffect(() => {
    const element = inputRef.current
    if (!element) return

    const observer = new ResizeObserver(() => {
      setInputHeight(element.getBoundingClientRect().height)
    })
    observer.observe(element)
    setInputHeight(element.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [])

  const activeChatSnapshot = useMemo(
    () => getActiveChatSnapshot(chatSnapshot, activeChatId),
    [activeChatId, chatSnapshot]
  )
  const activeSidebarChat = useMemo(
    () => getSidebarChatRow(sidebarData.workspaceGroups, activeChatId),
    [activeChatId, sidebarData.workspaceGroups]
  )
  useEffect(() => {
    logAppState("active snapshot resolved", {
      routeChatId: activeChatId,
      rawSnapshotChatId: chatSnapshot?.runtime.chatId ?? null,
      rawSnapshotProvider: chatSnapshot?.runtime.provider ?? null,
      activeSnapshotChatId: activeChatSnapshot?.runtime.chatId ?? null,
      activeSnapshotProvider: activeChatSnapshot?.runtime.provider ?? null,
      pendingChatId,
    })
  }, [activeChatId, activeChatSnapshot, chatSnapshot, pendingChatId])
  const latestToolIds = useMemo(() => getLatestToolIds(messages), [messages])
  const runtime = activeChatSnapshot?.runtime ?? null
  const currentAccountInfo = useMemo(() => {
    const firstAccountInfo = messages.find((message) => message.kind === "account_info")
    return firstAccountInfo?.message.accountInfo ?? null
  }, [messages])
  const availableProviders = activeChatSnapshot?.availableProviders ?? PROVIDERS
  const isProcessing = isProcessingStatus(runtime?.status)
  const canCancel = canCancelStatus(runtime?.status)
  const hasResolvedActiveSidebarChat = !activeChatId || activeSidebarChat !== null

  const {
    scrollRef,
    sentinelRef,
    scrollFollowToBottom,
    showScrollButton,
    transcriptPaddingBottom,
    scrollToBottom,
    keepComposerSubmitAnchored,
    scrollModeRef,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  } = useScrollSync({
    activeChatId,
    messages,
    sidebarReady,
    hasSidebarChat: hasResolvedActiveSidebarChat,
    inputHeight,
    runtime,
    cachedScrollState,
  })

  // Populate the bridge ref so useTranscriptLifecycle can read scroll state on departure
  scrollStateRef.current = { scrollRef, scrollModeRef }

  const fallbackLocalProjectPath = localProjects?.workspaces[0]?.localPath ?? null
  const selectedProject = resolveProjectSelection(projectSelection)
  const selectedProjectId = selectedProject.workspaceId
  const navbarLocalPath =
    runtime?.localPath
    ?? fallbackLocalProjectPath
    ?? sidebarData.workspaceGroups[0]?.localPath
  const hasSelectedProject = Boolean(
    selectedProjectId
    ?? runtime?.workspaceId
    ?? sidebarData.workspaceGroups[0]?.groupKey
    ?? fallbackLocalProjectPath
  )
  const chatHasKnownMessages = activeSidebarChat?.lastMessageAt !== undefined

  const { currentSessionRuntime, currentRepoStatus } = useSessionPolling({
    socket,
    activeChatId,
    sessionProvider: activeChatSnapshot?.runtime.provider,
    sessionToken: activeChatSnapshot?.runtime.sessionToken,
    isProcessing,
    resumeRefreshNonce,
  })

  // Mark active chat as read when navigating to it (tab must be visible + focused)
  const markActiveChatRead = useCallback(() => {
    const chatId = activeChatId
    if (!chatId) {
      return
    }
    const chat = getSidebarChatRow(sidebarData.workspaceGroups, activeChatId)
    if (!shouldMarkActiveChatRead({
      activeChatId: chatId,
      sidebarReady,
      chatUnread: chat?.unread === true,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
    })) {
      return
    }
    void socket.command({ type: "chat.markRead", chatId }).catch(setNormalizedCommandError)
  }, [activeChatId, sidebarData.workspaceGroups, sidebarReady, socket, setNormalizedCommandError])

  useEffect(() => {
    markActiveChatRead()
  }, [markActiveChatRead])

  // Re-trigger mark-read when the tab becomes active again without forcing a full app rerender.
  useEffect(() => {
    function handleFocusChange() {
      markActiveChatRead()
    }
    window.addEventListener("focus", handleFocusChange)
    document.addEventListener("visibilitychange", handleFocusChange)
    return () => {
      window.removeEventListener("focus", handleFocusChange)
      document.removeEventListener("visibilitychange", handleFocusChange)
    }
  }, [markActiveChatRead])

  const commands = useChatCommands({
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
    messages,
    localProjects,
    setProjectSelection,
    setSidebarData,
    setPendingChatId,
    setSidebarOpen,
    setCommandError,
    setNormalizedCommandError,
    scrollFollowToBottom,
    keepComposerSubmitAnchored,
    activeQueuedText,
    updateSubmitPipeline,
    submitPipeline,
    pendingDeletedChatIdsRef,
  })

  // Wire up the snapshot callback ref now that commands is available
  snapshotCallbackRef.current = commands.updateSubmitPipelineFromSnapshot

  return {
    socket,
    activeChatId,
    sidebarData,
    localProjects,
    updateSnapshot,
    chatSnapshot,
    orchestrationHierarchy,
    connectionStatus,
    sidebarReady,
    localProjectsReady,
    commandError,
    startingLocalPath: commands.startingLocalPath,
    sidebarOpen,
    sidebarCollapsed,
    scrollRef,
    sentinelRef,
    inputRef,
    messages,
    latestToolIds,
    runtime,
    currentSessionRuntime,
    currentRepoStatus,
    currentAccountInfo,
    availableProviders,
    isProcessing,
    canCancel,
    queuedText: activeQueuedText,
    transcriptPaddingBottom,
    showScrollButton,
    navbarLocalPath,
    hasSelectedProject,
    chatHasKnownMessages,
    localFilePreview: commands.localFilePreview,
    openSidebar: () => {
      setSidebarOpen(true)
      if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
        (document.activeElement as HTMLElement)?.blur?.()
      }
    },
    closeSidebar: () => setSidebarOpen(false),
    collapseSidebar: () => setSidebarCollapsed(true),
    expandSidebar: () => setSidebarCollapsed(false),
    closeLocalFilePreview: commands.closeLocalFilePreview,
    scrollToBottom,
    beginProgrammaticScroll,
    endProgrammaticScroll,
    handleCreateChat: commands.handleCreateChat,
    handleOpenLocalProject: commands.handleOpenLocalProject,
    handleCreateProject: commands.handleCreateProject,
    handleCheckForUpdates: commands.handleCheckForUpdates,
    handleInstallUpdate: commands.handleInstallUpdate,
    handleSend: commands.handleSend,
    handleSubmitFromComposer: commands.handleSubmitFromComposer,
    handleCancel: commands.handleCancel,
    clearQueuedText,
    restoreQueuedText,
    handleDeleteChat: commands.handleDeleteChat,
    handleRenameChat: commands.handleRenameChat,
    handleRemoveProject: commands.handleRemoveProject,
    handleCreateWorkspace: commands.handleCreateWorkspace,
    handleDeleteWorkspace: commands.handleDeleteWorkspace,
    handleRenameWorkspace: commands.handleRenameWorkspace,
    handleTogglePinWorkspace: commands.handleTogglePinWorkspace,
    handleReorderWorkspaces: commands.handleReorderWorkspaces,
    handleOpenExternal: commands.handleOpenExternal,
    handleOpenExternalPath: commands.handleOpenExternalPath,
    handleOpenLocalLink: commands.handleOpenLocalLink,
    handleOpenExternalLink: commands.handleOpenExternalLink,
    handleCompose: commands.handleCompose,
    handleForkSession: commands.handleForkSession,
    handleMergeSession: commands.handleMergeSession,
    pendingMergeProjectId: commands.pendingMergeProjectId,
    pendingSessionBootstrap: commands.pendingSessionBootstrap,
    dismissBootstrapError: commands.dismissBootstrapError,
    requestMerge: commands.requestMerge,
    clearMergeRequest: commands.clearMergeRequest,
    handleAskUserQuestion: commands.handleAskUserQuestion,
    handleExitPlanMode: commands.handleExitPlanMode,
    clearCommandError: useCallback(() => setCommandError(null), []),
    needsPickRequest: commands.needsPickRequest,
    clearNeedsPickRequest: commands.clearNeedsPickRequest,
  }
}

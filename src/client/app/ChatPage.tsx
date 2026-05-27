import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { useLocation, useNavigate, useOutletContext } from "react-router-dom"
import { TinkariaSidebarMark } from "../components/branding/TinkariaSidebarMark"
import { ChatInput } from "../components/chat-ui/ChatInput"
import { SubagentIndicator } from "../components/chat-ui/SubagentIndicator"
import { ChatNavbar } from "../components/chat-ui/ChatNavbar"
import { ForkSessionDialog } from "../components/chat-ui/ForkSessionDialog"
import { MergeSessionDialog } from "../components/chat-ui/MergeSessionDialog"
import { RightSidebar } from "../components/chat-ui/RightSidebar"
// Lazy-loaded: imports react-markdown, only needed when user opens a file preview
const LocalFilePreviewDialog = lazy(() => import("../components/messages/LocalFilePreviewDialog").then(m => ({ default: m.LocalFilePreviewDialog })))
import { ProcessingMessage } from "../components/messages/ProcessingMessage"
import { Button } from "../components/ui/button"
import { Card, CardContent } from "../components/ui/card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable"
import { ScrollArea } from "../components/ui/scroll-area"
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../lib/uiIdentityOverlay"
import { cn } from "../lib/utils"
import { deriveTouchedFiles } from "../lib/touchedFiles"
import {
  DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT,
  RIGHT_SIDEBAR_MAX_SIZE_PERCENT,
  RIGHT_SIDEBAR_MIN_SIZE_PERCENT,
  useRightSidebarStore,
} from "../stores/rightSidebarStore"
import { useSkillCompositionStore } from "../stores/skillCompositionStore"
import { useRightSidebarToggleAnimation } from "./useRightSidebarToggleAnimation"
import type { AppState } from "./useAppState"
import { TranscriptActionsContext } from "./TranscriptActionsContext"
import { enrichCommandError } from "./appState.helpers"
import { getChatEmptyStateText } from "../lib/quirkyCopy"
import { ChatTranscript, type ChatVirtualizer } from "./ChatTranscript"
import { useStickyChatFocus } from "./useStickyChatFocus"
import type { TranscriptRenderUnit } from "../../shared/types"
import { useEventCallback } from "../hooks/useEventCallback"
import { ChatNavigator } from "./ChatNavigator"
import { useChatNavigator } from "./useChatNavigator"
import { RunnerPickerDialog } from "../components/chat-ui/RunnerPickerDialog"

// Navbar is now a flow element — no offset constant needed
const SCROLL_BUTTON_BASE_BOTTOM_PX = 120
const SCROLL_BUTTON_SKILLS_RIBBON_OFFSET_PX = 52
const MOBILE_SIDEBAR_SWIPE_EDGE_FRACTION = 1 / 3
const MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE_PX = 72
const MOBILE_SIDEBAR_SWIPE_MAX_VERTICAL_DRIFT_PX = 56
const CHAT_PAGE_UI_DESCRIPTORS = {
  page: createC3UiIdentityDescriptor({
    id: "chat.page",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  transcript: createC3UiIdentityDescriptor({
    id: "transcript.message-list",
    c3ComponentId: "c3-111",
    c3ComponentLabel: "messages",
  }),
  composer: createC3UiIdentityDescriptor({
    id: "chat.composer",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  navbar: createC3UiIdentityDescriptor({
    id: "chat.navbar",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
} as const
const CHAT_PAGE_UI_IDENTITIES = getUiIdentityIdMap(CHAT_PAGE_UI_DESCRIPTORS)

const MOBILE_SIDEBAR_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "label",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[data-no-sidebar-swipe]",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[role='textbox']",
].join(",")

interface MobileSidebarSwipeDecisionArgs {
  startX: number
  startY: number
  currentX: number
  currentY: number
  viewportWidth: number
  isMobileViewport: boolean
  isSidebarOpen: boolean
  target: EventTarget | null
}

export interface MobileSidebarSwipeState {
  pointerId: number
  startX: number
  startY: number
  target: EventTarget | null
}

interface ComposerLiftArgs {
  layoutViewportHeight: number | null
  visualViewportHeight: number | null
  visualViewportOffsetTop: number | null
  isTouchDevice: boolean
}

type SidebarDialogRequest = "fork" | "merge"

function isSidebarDialogRequest(value: unknown): value is SidebarDialogRequest {
  return value === "fork" || value === "merge"
}

export function getRequestedSidebarDialog(state: unknown): SidebarDialogRequest | null {
  if (!state || typeof state !== "object") {
    return null
  }

  const candidate = (state as { sidebarDialog?: unknown }).sidebarDialog
  return isSidebarDialogRequest(candidate) ? candidate : null
}

export function TranscriptTailBoundary({
  hasMessages,
  sentinelRef,
}: {
  hasMessages: boolean
  sentinelRef: AppState["sentinelRef"]
}) {
  if (!hasMessages) {
    return <div ref={sentinelRef} className="h-px" aria-hidden="true" />
  }

  return (
    <>
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />
      <div style={{ height: 250 }} aria-hidden="true" />
    </>
  )
}

function getSkillsFromDebugRaw(debugRaw?: string): string[] | null {
  if (!debugRaw) return null
  try {
    const parsed = JSON.parse(debugRaw) as { skills?: unknown }
    if (!Array.isArray(parsed.skills)) return null
    const result: string[] = []
    const seen = new Set<string>()
    for (const skill of parsed.skills) {
      if (typeof skill !== "string") continue
      const trimmed = skill.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      result.push(trimmed)
    }
    return result.length > 0 ? result : null
  } catch (error) {
    void error
    return null
  }
}

export function getAvailableSkillsFromMessages(messages: TranscriptRenderUnit[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const unit = messages[i]
    if (unit.kind !== "system_init") continue
    return getSkillsFromDebugRaw(unit.message.debugRaw) ?? unit.message.slashCommands
  }
  return []
}

export function getPendingSessionBootstrapStatusLabel(state: Pick<AppState, "pendingSessionBootstrap">): string {
  if (state.pendingSessionBootstrap?.phase === "compacting") {
    return state.pendingSessionBootstrap.kind === "fork"
      ? "Preparing the opening brief from the current chat..."
      : "Preparing the combined opening brief..."
  }

  if (state.pendingSessionBootstrap?.phase === "starting") {
    return state.pendingSessionBootstrap.kind === "fork"
      ? "Starting the forked session..."
      : "Starting the merged session..."
  }

  return ""
}

export function getScrollButtonBottomPx(args: {
  hasAvailableSkills: boolean
  skillsRibbonVisible: boolean
}): number {
  return args.hasAvailableSkills && args.skillsRibbonVisible
    ? SCROLL_BUTTON_BASE_BOTTOM_PX + SCROLL_BUTTON_SKILLS_RIBBON_OFFSET_PX
    : SCROLL_BUTTON_BASE_BOTTOM_PX
}

export function getComposerLiftPx(args: ComposerLiftArgs): number {
  if (!args.isTouchDevice) return 0
  if (
    args.layoutViewportHeight === null
    || args.visualViewportHeight === null
    || args.visualViewportOffsetTop === null
  ) {
    return 0
  }

  const obscuredBottom = args.layoutViewportHeight - (args.visualViewportHeight + args.visualViewportOffsetTop)
  return obscuredBottom > 0 ? Math.round(obscuredBottom) : 0
}

export function shouldIgnoreMobileSidebarSwipeStart(target: EventTarget | null): boolean {
  if (typeof target !== "object" || target === null || !("closest" in target)) {
    return false
  }

  const candidate = target as { closest?: (selector: string) => unknown }
  return typeof candidate.closest === "function"
    && candidate.closest(MOBILE_SIDEBAR_INTERACTIVE_SELECTOR) !== null
}

export function shouldOpenMobileSidebarFromSwipe(args: MobileSidebarSwipeDecisionArgs): boolean {
  if (!args.isMobileViewport || args.isSidebarOpen) {
    return false
  }

  if (shouldIgnoreMobileSidebarSwipeStart(args.target)) {
    return false
  }

  if (args.startX > args.viewportWidth * MOBILE_SIDEBAR_SWIPE_EDGE_FRACTION) {
    return false
  }

  const deltaX = args.currentX - args.startX
  const deltaY = Math.abs(args.currentY - args.startY)
  if (deltaX < MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE_PX) {
    return false
  }

  if (deltaY > MOBILE_SIDEBAR_SWIPE_MAX_VERTICAL_DRIFT_PX) {
    return false
  }

  return deltaX > deltaY
}

export function shouldCloseMobileSidebarFromSwipe(args: MobileSidebarSwipeDecisionArgs): boolean {
  if (!args.isMobileViewport || !args.isSidebarOpen) {
    return false
  }

  if (shouldIgnoreMobileSidebarSwipeStart(args.target)) {
    return false
  }

  const deltaX = args.startX - args.currentX
  const deltaY = Math.abs(args.currentY - args.startY)
  if (deltaX < MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE_PX) {
    return false
  }

  if (deltaY > MOBILE_SIDEBAR_SWIPE_MAX_VERTICAL_DRIFT_PX) {
    return false
  }

  return deltaX > deltaY
}

export function getTranscriptAreaVisibility(args: {
  messageCount: number
  chatHasKnownMessages: boolean
}): "transcript" | "loading" | "empty" {
  if (args.messageCount > 0) return "transcript"
  return args.chatHasKnownMessages ? "loading" : "empty"
}

export function shouldDismissMobileKeyboardOnFirstMessage(
  previousMessageCount: number,
  currentMessageCount: number,
  isTouchDevice: boolean
): boolean {
  return isTouchDevice && previousMessageCount === 0 && currentMessageCount > 0
}

export function shouldRenderTranscriptCommandError(args: {
  commandError: string | null
  connectionStatus: AppState["connectionStatus"]
}): boolean {
  if (!args.commandError) return false
  if (args.connectionStatus === "connected") return true

  const normalizedError = args.commandError.toLowerCase()
  if (normalizedError.includes("can't reach your local") || normalizedError.includes("will keep trying to reconnect")) {
    return false
  }

  return true
}

export function getChatPageUiIdentities() {
  return CHAT_PAGE_UI_IDENTITIES
}

export function getChatPageUiIdentityDescriptors() {
  return CHAT_PAGE_UI_DESCRIPTORS
}

export function ChatEmptyStateBrandMark() {
  return (
    <TinkariaSidebarMark
      className="size-8 border-slate-300/60 bg-white/55 p-[3px] text-muted-foreground tinkaria-empty-state-flower dark:border-white/10 dark:bg-white/[0.02]"
      imageClassName="size-full"
    />
  )
}

export function ChatPage() {
  const state = useOutletContext<AppState>()
  const location = useLocation()
  const navigate = useNavigate()
  const chatCardRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const mobileSidebarSwipeRef = useRef<MobileSidebarSwipeState | null>(null)
  const previousMessageCountRef = useRef(state.messages.length)
  const workspaceId = state.runtime?.workspaceId ?? null
  const projectRightSidebarLayout = useRightSidebarStore((store) => (workspaceId ? store.workspaces[workspaceId] : undefined))
  const rightSidebarLayout = projectRightSidebarLayout ?? DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT
  const toggleRightSidebar = useRightSidebarStore((store) => store.toggleVisibility)
  const setRightSidebarSize = useRightSidebarStore((store) => store.setSize)
  const skillsRibbonVisible = useSkillCompositionStore((store) => store.ribbonVisible)

  const virtualizerRef = useRef<ChatVirtualizer | null>(null)

  const chatNav = useChatNavigator({
    messages: state.messages,
    scrollRef: state.scrollRef,
    virtualizerRef,
    scrollToBottom: state.scrollToBottom,
    beginProgrammaticScroll: state.beginProgrammaticScroll,
    endProgrammaticScroll: state.endProgrammaticScroll,
  })

  const availableSkills = useMemo(() => {
    const fromMessages = getAvailableSkillsFromMessages(state.messages)
    if (fromMessages.length > 0) return fromMessages
    return state.chatSnapshot?.availableSkills ?? []
  }, [state.messages, state.chatSnapshot?.availableSkills])
  const scrollButtonBottomPx = getScrollButtonBottomPx({
    hasAvailableSkills: availableSkills.length > 0,
    skillsRibbonVisible,
  })
  const handleComposerSubmit = useEventCallback(state.handleSubmitFromComposer)
  const handleComposerCancel = useEventCallback(() => {
    void state.handleCancel()
  })
  const handleClearQueuedText = useEventCallback(() => {
    state.clearQueuedText()
  })
  const handleRestoreQueuedText = useEventCallback(() => state.restoreQueuedText())
  const showRightSidebar = Boolean(workspaceId && rightSidebarLayout.isVisible)
  const [forkDialogOpen, setForkDialogOpen] = useState(false)
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [composerLiftPx, setComposerLiftPx] = useState(0)
  // PR5: track last pinned runner name for the composer indicator (best-effort)
  const [pinnedRunnerName, setPinnedRunnerName] = useState<string | null>(null)
  const requestedSidebarDialog = getRequestedSidebarDialog(location.state)
  const mergeSourceProjectId = state.pendingMergeProjectId ?? workspaceId
  const mergeAvailableChats = useMemo(() => {
    if (!mergeSourceProjectId) return []
    const group = state.sidebarData.workspaceGroups.find((g) => g.groupKey === mergeSourceProjectId)
    if (!group) return []
    return group.chats.filter((chat) => chat.chatId !== state.activeChatId)
  }, [mergeSourceProjectId, state.sidebarData.workspaceGroups, state.activeChatId])
  const knownChatIds = useMemo(
    () => new Set(state.sidebarData.workspaceGroups.flatMap((group) => group.chats.map((chat) => chat.chatId))),
    [state.sidebarData.workspaceGroups],
  )
  const transcriptVisibility = getTranscriptAreaVisibility({
    messageCount: state.messages.length,
    chatHasKnownMessages: state.chatHasKnownMessages,
  })
  const emptyStateText = getChatEmptyStateText(state.activeChatId)

  const transcriptActions = useMemo(() => {
    const findGroupForActiveChat = () =>
      state.sidebarData.workspaceGroups.find((g) =>
        g.chats.some((c) => c.chatId === state.activeChatId)
      )

    return {
      onRetryChat: () => {
        const group = findGroupForActiveChat()
        if (group) void state.handleCreateChat(group.groupKey)
      },
      onNewChat: () => {
        const group = findGroupForActiveChat()
        if (group) void state.handleCreateChat(group.groupKey)
      },
      onResumeSession: null,
      onDismissError: () => {
        state.clearCommandError()
      },
      onRetryBootstrap: null,
    }
  }, [state.sidebarData.workspaceGroups, state.activeChatId, state.handleCreateChat, state.clearCommandError])

  useEffect(() => {
    if (state.pendingMergeProjectId) {
      setMergeDialogOpen(true)
    }
  }, [state.pendingMergeProjectId])

  useEffect(() => {
    if (!requestedSidebarDialog) {
      return
    }

    if (requestedSidebarDialog === "fork") {
      setForkDialogOpen(true)
    } else {
      setMergeDialogOpen(true)
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [requestedSidebarDialog, navigate, location.pathname])

  const shouldRenderRightSidebarLayout = Boolean(workspaceId)
  const {
    isAnimating: isRightSidebarAnimating,
    panelGroupRef: rightSidebarPanelGroupRef,
    sidebarPanelRef,
    sidebarVisualRef,
  } = useRightSidebarToggleAnimation({
    workspaceId,
    shouldRenderRightSidebarLayout,
    showRightSidebar,
    rightSidebarSize: rightSidebarLayout.size,
  })

  useStickyChatFocus({
    rootRef: chatCardRef,
    fallbackRef: chatInputRef,
    enabled: state.hasSelectedProject && state.runtime?.status !== "waiting_for_user" && !state.sidebarOpen,
    canCancel: state.canCancel,
  })

  const handleMobileSidebarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      mobileSidebarSwipeRef.current = null
      return
    }

    mobileSidebarSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.target,
    }
  }

  const handleMobileSidebarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = mobileSidebarSwipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) {
      return
    }

    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches
    if (!shouldOpenMobileSidebarFromSwipe({
      startX: swipe.startX,
      startY: swipe.startY,
      currentX: event.clientX,
      currentY: event.clientY,
      viewportWidth: window.innerWidth,
      isMobileViewport,
      isSidebarOpen: state.sidebarOpen,
      target: swipe.target,
    })) {
      return
    }

    mobileSidebarSwipeRef.current = null
    state.openSidebar()
  }

  const handleMobileSidebarPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mobileSidebarSwipeRef.current?.pointerId === event.pointerId) {
      mobileSidebarSwipeRef.current = null
    }
  }

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      if (!workspaceId) return
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key === "b") {
        event.preventDefault()
        toggleRightSidebar(workspaceId)
        return
      }

      if (mod && event.altKey && event.key === "f") {
        event.preventDefault()
        void state.handleOpenExternal("open_finder")
      }
    }

    window.addEventListener("keydown", handleGlobalKeydown)
    return () => window.removeEventListener("keydown", handleGlobalKeydown)
  }, [workspaceId, state, toggleRightSidebar])

  useEffect(() => {
    if (typeof window === "undefined") {
      setComposerLiftPx(0)
      return
    }

    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0
    const visualViewport = window.visualViewport
    if (!isTouchDevice || !visualViewport) {
      setComposerLiftPx(0)
      return
    }

    const syncComposerLift = () => {
      setComposerLiftPx(getComposerLiftPx({
        layoutViewportHeight: window.innerHeight,
        visualViewportHeight: visualViewport.height,
        visualViewportOffsetTop: visualViewport.offsetTop,
        isTouchDevice,
      }))
    }

    syncComposerLift()
    visualViewport.addEventListener("resize", syncComposerLift)
    visualViewport.addEventListener("scroll", syncComposerLift)
    window.addEventListener("resize", syncComposerLift)
    return () => {
      visualViewport.removeEventListener("resize", syncComposerLift)
      visualViewport.removeEventListener("scroll", syncComposerLift)
      window.removeEventListener("resize", syncComposerLift)
    }
  }, [])


  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current
    previousMessageCountRef.current = state.messages.length

    if (!shouldDismissMobileKeyboardOnFirstMessage(
      previousMessageCount,
      state.messages.length,
      navigator.maxTouchPoints > 0
    )) {
      return
    }

    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement)) {
      return
    }

    activeElement.blur()
  }, [state.messages.length])

  const effectiveTranscriptPaddingBottom = state.transcriptPaddingBottom + composerLiftPx
  const effectiveScrollButtonBottomPx = scrollButtonBottomPx + composerLiftPx

  const clampRightSidebarSize = (size: number) => {
    if (!Number.isFinite(size)) {
      return rightSidebarLayout.size
    }

    return Math.min(RIGHT_SIDEBAR_MAX_SIZE_PERCENT, Math.max(RIGHT_SIDEBAR_MIN_SIZE_PERCENT, size))
  }

  const touchedFiles = useMemo(() => deriveTouchedFiles(state.messages), [state.messages])

  const chatCard = (
    <Card ref={chatCardRef} className="bg-background h-full flex flex-col overflow-hidden border-0 rounded-none relative">
      <CardContent className="flex flex-1 min-h-0 flex-col p-0 overflow-hidden relative">
        <Suspense fallback={null}>
          <LocalFilePreviewDialog
            preview={state.localFilePreview}
            workspacePath={state.navbarLocalPath}
            onClose={state.closeLocalFilePreview}
            onOpenLocalLink={(target) => {
              void state.handleOpenLocalLink(target)
            }}
          />
        </Suspense>

        <ChatNavbar
          sidebarCollapsed={state.sidebarCollapsed}
          onOpenSidebar={state.openSidebar}
          onCollapseSidebar={state.collapseSidebar}
          onExpandSidebar={state.expandSidebar}
          onForkSession={() => setForkDialogOpen(true)}
          onMergeSession={() => setMergeDialogOpen(true)}
          localPath={state.navbarLocalPath}
          currentSessionRuntime={state.currentSessionRuntime}
          currentRepoStatus={state.currentRepoStatus}
          chatTitle={state.runtime?.title}
          chatStatus={state.runtime?.status}
          runtimeModel={state.runtime?.model}
          runtimeProvider={state.runtime?.provider}
          socket={state.socket}
          onOpenPtyChat={(chatId) => navigate(`/chat/${chatId}`)}
        />

        <ForkSessionDialog
          open={forkDialogOpen}
          onOpenChange={setForkDialogOpen}
          sourceTitle={state.runtime?.title ?? null}
          defaultProvider={state.runtime?.provider ?? "claude"}
          defaultModel={state.availableProviders.find(
            (p) => p.id === (state.runtime?.provider ?? "claude")
          )?.models[0]?.id ?? "opus"}
          availableProviders={state.availableProviders}
          onFork={state.handleForkSession}
        />

        <MergeSessionDialog
          open={mergeDialogOpen}
          onOpenChange={(open) => {
            setMergeDialogOpen(open)
            if (!open) state.clearMergeRequest()
          }}
          defaultProvider={state.runtime?.provider ?? "claude"}
          defaultModel={state.availableProviders.find(
            (p) => p.id === (state.runtime?.provider ?? "claude")
          )?.models[0]?.id ?? "opus"}
          availableProviders={state.availableProviders}
          availableChats={mergeAvailableChats}
          minSessions={state.pendingMergeProjectId ? 2 : 1}
          onMerge={state.handleMergeSession}
        />

        <RunnerPickerDialog
          request={state.needsPickRequest}
          onClose={state.clearNeedsPickRequest}
          onPicked={(runnerId) => setPinnedRunnerName(runnerId.slice(-8))}
        />

        <div className="flex-1 min-h-0 relative" {...getUiIdentityAttributeProps(CHAT_PAGE_UI_DESCRIPTORS.transcript)}>
          <ScrollArea
            ref={state.scrollRef}
            className="h-full px-4"
          >
            {transcriptVisibility !== "transcript" ? <div style={{ height: effectiveTranscriptPaddingBottom }} aria-hidden="true" /> : null}
            {transcriptVisibility === "transcript" ? (
              <TranscriptActionsContext.Provider value={transcriptActions}>
                <div className="animate-fade-in space-y-5 pt-4 max-w-[800px] mx-auto">
                  <ChatTranscript
                    messages={state.messages}
                    scrollRef={state.scrollRef}
                    isLoading={state.isProcessing}
                    localPath={state.runtime?.localPath}
                    latestToolIds={state.latestToolIds}
                    onOpenLocalLink={state.handleOpenLocalLink}
                    onOpenExternalLink={state.handleOpenExternalLink}
                    onAskUserQuestionSubmit={state.handleAskUserQuestion}
                    onExitPlanModeConfirm={state.handleExitPlanMode}
                    virtualizerRef={virtualizerRef}
                  />
                  {state.isProcessing ? <ProcessingMessage status={state.runtime?.status} /> : null}
                  {shouldRenderTranscriptCommandError({
                    commandError: state.commandError,
                    connectionStatus: state.connectionStatus,
                  }) ? (() => {
                    const enriched = enrichCommandError(state.commandError!)
                    return (
                      <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-1">
                          <span className="font-medium">{enriched.message}</span>
                          {enriched.hint ? (
                            <p className="text-muted-foreground text-xs">{enriched.hint}</p>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 -mt-1 -mr-2 text-destructive/70 hover:text-destructive"
                          onClick={state.clearCommandError}
                        >
                          Dismiss
                        </Button>
                      </div>
                    )
                  })() : null}
                </div>
                <TranscriptTailBoundary hasMessages={true} sentinelRef={state.sentinelRef} />
              </TranscriptActionsContext.Provider>
            ) : null}
            {transcriptVisibility !== "transcript" ? <TranscriptTailBoundary hasMessages={false} sentinelRef={state.sentinelRef} /> : null}
          </ScrollArea>

          {transcriptVisibility === "loading" ? (
            <div
              className="pointer-events-none absolute inset-0 px-4"
              style={{ bottom: effectiveTranscriptPaddingBottom }}
            >
              <div className="mx-auto flex h-full max-w-[800px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
              </div>
            </div>
          ) : null}

          {transcriptVisibility === "empty" ? (
            <div
              className="pointer-events-none absolute inset-0 px-4"
              style={{ bottom: effectiveTranscriptPaddingBottom }}
            >
            <div className="mx-auto flex h-full max-w-[800px] items-center justify-center">
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-70">
                {state.pendingSessionBootstrap?.chatId === state.activeChatId ? (
                  state.pendingSessionBootstrap.phase === "error" ? (
                    <div className="pointer-events-auto flex flex-col items-center gap-3">
                      <AlertCircle className="h-8 w-8 text-destructive/60" />
                      <span className="text-sm font-medium text-destructive">
                        {state.pendingSessionBootstrap.kind === "fork" ? "Fork" : "Merge"} failed
                      </span>
                      {state.pendingSessionBootstrap.errorMessage ? (
                        <span className="max-w-sm text-center text-xs text-muted-foreground">
                          {state.pendingSessionBootstrap.errorMessage}
                        </span>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => state.dismissBootstrapError()}
                      >
                        Dismiss
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
                      <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-[24px] border border-border/70 bg-background/92 p-4 text-left shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                            {state.pendingSessionBootstrap.kind === "fork" ? "Fork draft" : "Merge draft"}
                          </span>
                          <span className="text-[11px] text-muted-foreground/70">
                            {state.pendingSessionBootstrap.phase === "compacting" ? "Preparing" : "Starting"}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-sm font-medium text-foreground">
                            {state.pendingSessionBootstrap.previewTitle}
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {state.pendingSessionBootstrap.previewIntent}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {getPendingSessionBootstrapStatusLabel(state)}
                      </span>
                      {state.pendingSessionBootstrap.phase === "compacting" ? (
                        <div className="flex max-w-md flex-wrap items-center justify-center gap-2">
                          {state.pendingSessionBootstrap.sourceLabels.map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )
                ) : (
                  <>
                    <ChatEmptyStateBrandMark />
                    <div
                      className="text-base font-normal text-muted-foreground text-center max-w-xs flex items-center tinkaria-empty-state-text"
                      aria-label={emptyStateText}
                    >
                      <span className="whitespace-pre">{emptyStateText}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
        </div>

        <div
          style={{ bottom: effectiveScrollButtonBottomPx }}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-30 transition-all",
            chatNav.visible
              ? "scale-100 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              : "scale-60 duration-300 ease-out pointer-events-none blur-sm opacity-0"
          )}
        >
          <ChatNavigator nav={chatNav} onScrollToBottom={state.scrollToBottom} />
        </div>
      </CardContent>

        <div
          style={{ bottom: composerLiftPx }}
          className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
          {...getUiIdentityAttributeProps(CHAT_PAGE_UI_DESCRIPTORS.composer)}
        >
        <div className="bg-gradient-to-t from-background via-background pointer-events-auto" ref={state.inputRef}>
          <div className="px-3 pb-2">
            <div className="max-w-[840px] mx-auto flex justify-end items-center gap-2">
              {pinnedRunnerName ? (
                <span className="text-xs text-muted-foreground/70 select-none" title="Pinned runner for this session">
                  runner: {pinnedRunnerName}
                </span>
              ) : null}
              <SubagentIndicator
                parentChatId={state.activeChatId}
                hierarchy={state.orchestrationHierarchy}
                socket={state.socket}
                localPath={state.runtime?.localPath ?? undefined}
                knownChatIds={knownChatIds}
                onOpenLocalLink={(target) => {
                  void state.handleOpenLocalLink(target)
                }}
                onOpenExternalLink={state.handleOpenExternalLink}
              />
            </div>
          </div>
          <ChatInput
            ref={chatInputRef}
            key={state.activeChatId ?? "new-chat"}
            onSubmit={handleComposerSubmit}
            onCancel={handleComposerCancel}
            queuedText={state.queuedText}
            onClearQueuedText={handleClearQueuedText}
            onRestoreQueuedText={handleRestoreQueuedText}
            disabled={!state.hasSelectedProject || state.runtime?.status === "waiting_for_user" || state.pendingSessionBootstrap?.chatId === state.activeChatId}
            canCancel={state.canCancel}
            chatId={state.activeChatId}
            connectionStatus={state.connectionStatus}
            activeProvider={state.runtime?.provider ?? null}
            runtimeModel={state.runtime?.model}
            availableProviders={state.availableProviders}
            availableSkills={availableSkills}
          />
        </div>
      </div>
    </Card>
  )

  return (
    <div
      className="flex-1 flex flex-col min-w-0 relative"
      onPointerDown={handleMobileSidebarPointerDown}
      onPointerMove={handleMobileSidebarPointerMove}
      onPointerUp={handleMobileSidebarPointerEnd}
      onPointerCancel={handleMobileSidebarPointerEnd}
      {...getUiIdentityAttributeProps(CHAT_PAGE_UI_DESCRIPTORS.page)}
    >
      {shouldRenderRightSidebarLayout && workspaceId ? (
        <ResizablePanelGroup
          key={`${workspaceId}-right-sidebar`}
          groupRef={rightSidebarPanelGroupRef}
          orientation="horizontal"
          className="flex-1 min-h-0"
          onLayoutChange={(layout) => {
            if (!showRightSidebar || isRightSidebarAnimating.current) {
              return
            }

            const clampedRightSidebarSize = clampRightSidebarSize(layout.rightSidebar)
            if (Math.abs(clampedRightSidebarSize - layout.rightSidebar) < 0.1) {
              return
            }

            rightSidebarPanelGroupRef.current?.setLayout({
              workspace: 100 - clampedRightSidebarSize,
              rightSidebar: clampedRightSidebarSize,
            })
          }}
          onLayoutChanged={(layout) => {
            if (!showRightSidebar || isRightSidebarAnimating.current) {
              return
            }

            setRightSidebarSize(workspaceId, clampRightSidebarSize(layout.rightSidebar))
          }}
        >
          <ResizablePanel
            id="workspace"
            defaultSize={`${100 - rightSidebarLayout.size}%`}
            minSize="50%"
            className="min-h-0 min-w-0"
          >
            {chatCard}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            orientation="horizontal"
            disabled={!showRightSidebar}
            className={cn(!showRightSidebar && "pointer-events-none opacity-0")}
          />
          <ResizablePanel
            id="rightSidebar"
            defaultSize={`${rightSidebarLayout.size}%`}
            maxSize={`${RIGHT_SIDEBAR_MAX_SIZE_PERCENT}%`}
            className="min-h-0 min-w-0"
            elementRef={sidebarPanelRef}
          >
            <div
              ref={sidebarVisualRef}
              className="h-full min-h-0 overflow-hidden"
              data-right-sidebar-open={showRightSidebar ? "true" : "false"}
              data-right-sidebar-animated="false"
              data-right-sidebar-visual
            >
              <RightSidebar
                onClose={() => toggleRightSidebar(workspaceId)}
                touchedFiles={touchedFiles}
                workspacePath={state.navbarLocalPath}
                onOpenFile={(path) => {
                  void state.handleOpenLocalLink({ path })
                }}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        chatCard
      )}
    </div>
  )
}

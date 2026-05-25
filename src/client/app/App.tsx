import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { TinkariaPage } from "./SettingsPage"
import {
  buildUiIdentityStack,
  createC3UiIdentityDescriptor,
  formatCopiedUiIdentity,
  isUiIdentityOverlayActive,
  UI_IDENTITY_ATTRIBUTE,
  type UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  type UiIdentityModifierState,
} from "../lib/uiIdentityOverlay"
import {
  isTouchDevice,
  findNearestUiIdentityElement,
  shouldInterceptMobileTap,
} from "../lib/uiIdentityMobile"
import { UiIdentityFab } from "../components/ui/UiIdentityFab"
import { AppDialogProvider } from "../components/ui/app-dialog"
import {
  UiIdentityOverlay,
  UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE,
  type UiIdentityOverlayAnchorRect,
} from "../components/ui/UiIdentityOverlay"
import { TooltipProvider } from "../components/ui/tooltip"
import { Toaster } from "sonner"
import { AppSidebar } from "./AppSidebar"
import { CreateWorkspaceModal } from "../components/CreateWorkspaceModal"
import { ChatPage } from "./ChatPage"
import { LocalProjectsPage } from "./LocalWorkspacesPage"
import { WorkspacePage } from "./WorkspacePage"
import { ProjectPage } from "./ProjectPage"
import { AppStateContext } from "./AppStateContext"
import { useAppState } from "./useAppState"
import { useEventCallback } from "../hooks/useEventCallback"
import { useShortcuts, type ShortcutRegistration } from "../hooks/useShortcuts"
import { ShortcutHelpOverlay } from "../components/ui/ShortcutHelpOverlay"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import { PROVIDERS, type AgentProvider, type SidebarChatRow } from "../../shared/types"

const UI_IDENTITY_OVERLAY_COPY_DURATION_MS = 1200
const UI_IDENTITY_OVERLAY_POINTER_HANDOFF_DELAY_MS = 320
const APP_LAYOUT_UI_DESCRIPTOR = createC3UiIdentityDescriptor({
  id: "app.layout",
  c3ComponentId: "c3-101",
  c3ComponentLabel: "app-shell",
})

export function getUiIdentityOverlayCopyDurationMs() {
  return UI_IDENTITY_OVERLAY_COPY_DURATION_MS
}

export function getUiIdentityOverlayPointerHandoffDelayMs() {
  return UI_IDENTITY_OVERLAY_POINTER_HANDOFF_DELAY_MS
}

export function shouldDeactivateMobileFabAfterCopyTargetSelection(args: {
  mobileActive: boolean
  didCopy: boolean
}): boolean {
  return args.mobileActive && args.didCopy
}

interface LegacySettingsRedirectArgs {
  pathname: string
  search?: string
  hash?: string
}

export function getLegacyTinkariaRedirectTarget({ pathname, search = "", hash = "" }: LegacySettingsRedirectArgs) {
  const sourceParams = new URLSearchParams(search)
  const pathTab = pathname.startsWith("/settings/")
    ? pathname.slice("/settings/".length).split("/")[0]
    : null
  const requestedTab = pathTab || sourceParams.get("tab")
  const targetParams = new URLSearchParams({ tab: "settings" })

  if (requestedTab === "providers" || requestedTab === "profiles" || requestedTab === "extensions") {
    targetParams.set("settingsTab", requestedTab)
  }

  return `/?${targetParams.toString()}${hash}`
}

export function getGlobalUiIdentityIds() {
  return {
    appLayout: "app.layout",
    sidebar: "chat.sidebar",
    rightSidebar: "chat.right-sidebar",
    chatRow: "sidebar.chat-row",
    projectGroup: "sidebar.project-group",
    chatRowMenu: "sidebar.chat-row.menu",
    projectGroupMenu: "sidebar.project-group.menu",
  }
}

export function getAppLayoutUiIdentityDescriptor() {
  return APP_LAYOUT_UI_DESCRIPTOR
}

type UiIdentityOverlayKeyboardEvent = Pick<KeyboardEvent, "altKey" | "shiftKey">
type UiIdentityOverlayPointerEvent = Pick<PointerEvent, "target" | "clientX" | "clientY">
type UiIdentityOverlayWindowLike = Pick<Window, "addEventListener" | "removeEventListener">

interface UiIdentityOverlayPointerPosition {
  clientX: number
  clientY: number
}

interface UiIdentityOverlayWindowHandlers {
  setModifiers: (modifiers: UiIdentityModifierState) => void
  setPointerTarget: (target: Element | null) => void
  setPointerPosition: (position: UiIdentityOverlayPointerPosition) => void
  resetHighlight: () => void
  cancelPendingPointerClear: () => void
  clearPointerTargetWithDelay: () => void
}

function hasClosest(target: EventTarget | null): target is EventTarget & { closest: (selector: string) => unknown } {
  return typeof (target as { closest?: unknown } | null)?.closest === "function"
}

function isUiIdentityOverlayElement(target: EventTarget | null): target is Element {
  return typeof (target as { getAttribute?: unknown } | null)?.getAttribute === "function"
}

function isUiIdentityOverlayKeyboardEvent(event: Event): event is Event & UiIdentityOverlayKeyboardEvent {
  return typeof (event as Partial<UiIdentityOverlayKeyboardEvent>).altKey === "boolean"
    && typeof (event as Partial<UiIdentityOverlayKeyboardEvent>).shiftKey === "boolean"
}

function isUiIdentityOverlayPointerEvent(event: Event): event is Event & UiIdentityOverlayPointerEvent {
  return typeof (event as Partial<UiIdentityOverlayPointerEvent>).clientX === "number"
    && typeof (event as Partial<UiIdentityOverlayPointerEvent>).clientY === "number"
}

export function shouldIgnoreUiIdentityOverlayPointerTarget(target: EventTarget | null): boolean {
  if (!hasClosest(target)) {
    return false
  }

  return Boolean(target.closest(`[${UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE}="true"]`))
}

function createUiIdentityOverlayInactiveModifiers(): UiIdentityModifierState {
  return { altKey: false, shiftKey: false }
}

function getUiIdentityOverlayModifiers(event: UiIdentityOverlayKeyboardEvent): UiIdentityModifierState {
  return { altKey: event.altKey, shiftKey: event.shiftKey }
}

function getUiIdentityOverlayPointerTarget(target: EventTarget | null): Element | null {
  if (!isUiIdentityOverlayElement(target)) {
    return null
  }

  return target
}

export function bindUiIdentityOverlayWindowEvents(
  windowLike: UiIdentityOverlayWindowLike,
  handlers: UiIdentityOverlayWindowHandlers,
) {
  let modifiers = createUiIdentityOverlayInactiveModifiers()

  function handleKeyChange(event: Event) {
    if (!isUiIdentityOverlayKeyboardEvent(event)) return
    modifiers = getUiIdentityOverlayModifiers(event)
    handlers.setModifiers(modifiers)
  }

  function handleWindowBlur() {
    modifiers = createUiIdentityOverlayInactiveModifiers()
    handlers.setModifiers(modifiers)
  }

  function handlePointerMove(event: Event) {
    if (!isUiIdentityOverlayPointerEvent(event)) return

    const target = event.target ?? null
    if (shouldIgnoreUiIdentityOverlayPointerTarget(target)) {
      handlers.cancelPendingPointerClear()
      return
    }

    if (isUiIdentityOverlayActive(modifiers)) {
      return
    }

    handlers.setPointerPosition({
      clientX: event.clientX,
      clientY: event.clientY,
    })

    const pointerTarget = getUiIdentityOverlayPointerTarget(target)
    if (buildUiIdentityStack(pointerTarget, 1).length === 0) {
      handlers.clearPointerTargetWithDelay()
      return
    }

    handlers.cancelPendingPointerClear()
    handlers.setPointerTarget(pointerTarget)
    handlers.resetHighlight()
  }

  windowLike.addEventListener("keydown", handleKeyChange)
  windowLike.addEventListener("keyup", handleKeyChange)
  windowLike.addEventListener("blur", handleWindowBlur)
  windowLike.addEventListener("pointermove", handlePointerMove)

  return () => {
    windowLike.removeEventListener("keydown", handleKeyChange)
    windowLike.removeEventListener("keyup", handleKeyChange)
    windowLike.removeEventListener("blur", handleWindowBlur)
    windowLike.removeEventListener("pointermove", handlePointerMove)
  }
}

function hasBoundingClientRect(
  element: Element | null,
): element is Element & { getBoundingClientRect: () => UiIdentityOverlayAnchorRect } {
  return typeof element?.getBoundingClientRect === "function"
}

export function getUiIdentityOverlayHighlightRect(
  stack: Element[],
  highlightedId: string | null,
): UiIdentityOverlayAnchorRect | null {
  const highlightedElement =
    stack.find((element) => element.getAttribute(UI_IDENTITY_ATTRIBUTE) === highlightedId) ?? stack[0] ?? null

  return hasBoundingClientRect(highlightedElement) ? highlightedElement.getBoundingClientRect() : null
}

export function getUiIdentityOverlayAnchorRect(
  pointerPosition: UiIdentityOverlayPointerPosition | null,
): UiIdentityOverlayAnchorRect | null {
  if (!pointerPosition) {
    return null
  }

  return {
    top: pointerPosition.clientY,
    left: pointerPosition.clientX,
    right: pointerPosition.clientX,
    bottom: pointerPosition.clientY,
    width: 0,
    height: 0,
  }
}

export interface MobileTapResult {
  target: Element
  clientX: number
  clientY: number
}

export function handleMobileTapCapture(event: MouseEvent): MobileTapResult | null {
  const target = event.target
  if (!target || typeof (target as Element).closest !== "function") {
    return null
  }

  if (!shouldInterceptMobileTap(target as Element)) {
    return null
  }

  const nearestTagged = findNearestUiIdentityElement(target as Element)
  if (!nearestTagged) {
    return null
  }

  event.preventDefault()
  event.stopPropagation()

  return {
    target: nearestTagged,
    clientX: event.clientX,
    clientY: event.clientY,
  }
}

export function getMobileTapAnchorRect(
  clientX: number,
  clientY: number,
): UiIdentityOverlayAnchorRect {
  return {
    top: clientY,
    left: clientX,
    right: clientX,
    bottom: clientY,
    width: 0,
    height: 0,
  }
}

async function copyUiIdentityToClipboard(descriptor: UiIdentityDescriptor): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard
  if (!clipboard?.writeText) {
    return false
  }

  return clipboard.writeText(formatCopiedUiIdentity(descriptor)).then(
    () => true,
    () => false,
  )
}

function UiIdentityOverlayController() {
  const [modifiers, setModifiers] = useState<UiIdentityModifierState>(createUiIdentityOverlayInactiveModifiers)
  const [pointerTarget, setPointerTarget] = useState<Element | null>(null)
  const [pointerPosition, setPointerPosition] = useState<UiIdentityOverlayPointerPosition | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mobileActive, setMobileActive] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)

  const stack = useMemo(() => buildUiIdentityStack(pointerTarget, 3), [pointerTarget])
  const keyboardActive = isUiIdentityOverlayActive(modifiers)
  const active = keyboardActive || mobileActive
  activeRef.current = active
  const anchorRect = useMemo<UiIdentityOverlayAnchorRect | null>(
    () => getUiIdentityOverlayAnchorRect(pointerPosition),
    [pointerPosition]
  )
  const effectiveHighlightedId = highlightedId ?? stack[0]?.getAttribute(UI_IDENTITY_ATTRIBUTE) ?? null
  const highlightRect = useMemo(
    () => getUiIdentityOverlayHighlightRect(stack, highlightedId),
    [highlightedId, stack]
  )

  useEffect(() => {
    return bindUiIdentityOverlayWindowEvents(window, {
      setModifiers,
      setPointerTarget,
      setPointerPosition,
      resetHighlight: () => {
        setHighlightedId(null)
      },
      cancelPendingPointerClear: () => {
        if (pointerClearTimeoutRef.current !== null) {
          clearTimeout(pointerClearTimeoutRef.current)
          pointerClearTimeoutRef.current = null
        }
      },
      clearPointerTargetWithDelay: () => {
        if (!activeRef.current) {
          setPointerTarget(null)
          setHighlightedId(null)
          return
        }
        if (pointerClearTimeoutRef.current !== null) {
          return
        }
        pointerClearTimeoutRef.current = setTimeout(() => {
          setPointerTarget(null)
          setHighlightedId(null)
          pointerClearTimeoutRef.current = null
        }, UI_IDENTITY_OVERLAY_POINTER_HANDOFF_DELAY_MS)
      },
    })
  }, [])

  useEffect(() => {
    if (!mobileActive) return

    function onCapture(event: MouseEvent) {
      const result = handleMobileTapCapture(event)
      if (!result) return

      setPointerTarget(result.target)
      setPointerPosition({ clientX: result.clientX, clientY: result.clientY })
      setHighlightedId(null)
    }

    window.addEventListener("click", onCapture, { capture: true })
    return () => {
      window.removeEventListener("click", onCapture, { capture: true })
    }
  }, [mobileActive])

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
      }
      if (pointerClearTimeoutRef.current !== null) {
        clearTimeout(pointerClearTimeoutRef.current)
      }
    }
  }, [])

  function handleCopy(descriptor: UiIdentityDescriptor) {
    void copyUiIdentityToClipboard(descriptor).then((didCopy) => {
      if (!didCopy) {
        return
      }

      if (shouldDeactivateMobileFabAfterCopyTargetSelection({ mobileActive, didCopy })) {
        setMobileActive(false)
        setPointerTarget(null)
        setPointerPosition(null)
        setHighlightedId(null)
      }

      setCopiedId(descriptor.id)
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
      }
      copiedTimeoutRef.current = setTimeout(() => {
        setCopiedId((current) => (current === descriptor.id ? null : current))
        copiedTimeoutRef.current = null
      }, UI_IDENTITY_OVERLAY_COPY_DURATION_MS)
    })
  }

  function handleToggleMobile() {
    setMobileActive((prev) => {
      if (prev) {
        setPointerTarget(null)
        setPointerPosition(null)
        setHighlightedId(null)
      }
      return !prev
    })
  }

  const showFab = isTouchDevice()

  return (
    <>
      <UiIdentityOverlay
        active={active}
        anchorRect={anchorRect}
        highlightRect={active ? highlightRect : null}
        stack={active ? stack : []}
        highlightedId={active ? effectiveHighlightedId : null}
        copiedId={copiedId}
        onCopy={handleCopy}
        onHighlight={setHighlightedId}
      />
      {showFab ? (
        <UiIdentityFab active={mobileActive} onToggle={handleToggleMobile} />
      ) : null}
    </>
  )
}

function AppLayout() {
  const location = useLocation()
  const state = useContext(AppStateContext)
  if (!state) {
    throw new Error("App layout requires state context")
  }
  const showMobileOpenButton = location.pathname === "/"
  const openSidebar = useEventCallback(() => state.openSidebar())
  const closeSidebar = useEventCallback(() => state.closeSidebar())
  const collapseSidebar = useEventCallback(() => state.collapseSidebar())
  const expandSidebar = useEventCallback(() => state.expandSidebar())
  const handleCreateChat = useEventCallback((workspaceId: string) => {
    void state.handleCreateChat(workspaceId)
  })
  const handleDeleteChat = useEventCallback((chat: Parameters<typeof state.handleDeleteChat>[0]) => {
    void state.handleDeleteChat(chat)
  })
  const handleRenameChat = useEventCallback((chatId: string, title: string) => {
    void state.handleRenameChat(chatId, title)
  })
  const handleRemoveProject = useEventCallback((workspaceId: string) => {
    void state.handleRemoveProject(workspaceId)
  })
  const handleInstallUpdate = useEventCallback(() => {
    void state.handleInstallUpdate()
  })
  const handleMergeSession = useEventCallback((workspaceId: string) => {
    state.requestMerge(workspaceId)
  })
  const handleRenameWorkspace = useEventCallback((workspaceId: string, name: string) => {
    void state.handleRenameWorkspace(workspaceId, name)
  })
  const handleTogglePinWorkspace = useEventCallback((workspaceId: string, pinned: boolean) => {
    void state.handleTogglePinWorkspace(workspaceId, pinned)
  })
  const handleReorderWorkspaces = useEventCallback((orderedWorkspaceIds: string[]) => {
    void state.handleReorderWorkspaces(orderedWorkspaceIds)
  })
  const handleDeleteWorkspace = useEventCallback((workspaceId: string) => {
    void state.handleDeleteWorkspace(workspaceId)
  })
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const handleCreateWorkspace = useEventCallback((name: string) => {
    void state.handleCreateWorkspace(name)
  })

  return (
    <div
      className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden"
      {...getUiIdentityAttributeProps(APP_LAYOUT_UI_DESCRIPTOR)}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar
          data={state.sidebarData}
          activeChatId={state.activeChatId}
          connectionStatus={state.connectionStatus}
          ready={state.sidebarReady}
          open={state.sidebarOpen}
          collapsed={state.sidebarCollapsed}
          showMobileOpenButton={showMobileOpenButton}
          onOpen={openSidebar}
          onClose={closeSidebar}
          onCollapse={collapseSidebar}
          onExpand={expandSidebar}
          onCreateChat={handleCreateChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
          onRemoveProject={handleRemoveProject}
          updateSnapshot={state.updateSnapshot}
          onInstallUpdate={handleInstallUpdate}
          onMergeSession={handleMergeSession}
          onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
          onRenameWorkspace={handleRenameWorkspace}
          onTogglePinWorkspace={handleTogglePinWorkspace}
          onReorderWorkspaces={handleReorderWorkspaces}
          onDeleteWorkspace={handleDeleteWorkspace}
        />
        <Outlet context={state} />
      </div>
      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onConfirm={handleCreateWorkspace}
      />
    </div>
  )
}

export function getNextProvider(currentProvider: AgentProvider, direction: 1 | -1): AgentProvider {
  const currentIndex = PROVIDERS.findIndex((provider) => provider.id === currentProvider)
  if (currentIndex === -1) return currentProvider
  const nextIndex = (currentIndex + direction + PROVIDERS.length) % PROVIDERS.length
  return PROVIDERS[nextIndex].id
}

export function getAdjacentUnreadChatId(
  chats: SidebarChatRow[],
  activeChatId: string | null,
  direction: 1 | -1,
): string | null {
  if (chats.length === 0) return null

  const activeIndex = activeChatId === null
    ? (direction === 1 ? -1 : chats.length)
    : chats.findIndex((chat) => chat.chatId === activeChatId)
  const startIndex = activeIndex === -1
    ? (direction === 1 ? -1 : chats.length)
    : activeIndex

  if (direction === 1) {
    const nextUnread = chats.find((chat, index) => index > startIndex && chat.unread)
    return nextUnread?.chatId ?? chats.find((chat) => chat.unread)?.chatId ?? null
  }

  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (chats[index].unread) {
      return chats[index].chatId
    }
  }

  for (let index = chats.length - 1; index >= 0; index -= 1) {
    if (chats[index].unread) {
      return chats[index].chatId
    }
  }

  return null
}

function ShortcutController() {
  const state = useContext(AppStateContext)
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const composerState = useChatPreferencesStore((s) => s.composerState)
  const resetComposerFromProvider = useChatPreferencesStore((s) => s.resetComposerFromProvider)

  const isNewChat = state ? !state.chatHasKnownMessages : false
  const activeScope = isNewChat ? "new-chat" as const : "global" as const

  const registrations = useMemo((): ShortcutRegistration[] => {
    const createNewChat = () => {
      if (!state) return
      const workspaceId = state.runtime?.workspaceId
        ?? state.sidebarData.workspaceGroups[0]?.groupKey
      if (workspaceId) {
        void state.handleCreateChat(workspaceId)
      }
    }

    const cycleProvider = (direction: 1 | -1) => {
      const nextProvider = getNextProvider(composerState.provider, direction)
      resetComposerFromProvider(nextProvider)
    }

    const moveToUnreadSession = (direction: 1 | -1) => {
      if (!state) return
      const allChats = state.sidebarData.workspaceGroups.flatMap((group) => group.chats)
      const nextChatId = getAdjacentUnreadChatId(allChats, state.activeChatId, direction)
      if (!nextChatId || nextChatId === state.activeChatId) return
      navigate(`/chat/${nextChatId}`)
    }

    return [
      { key: "/", alt: true, label: "Show shortcuts", scope: "global", handler: () => setHelpOpen((v) => !v) },
      { key: "n", alt: true, label: "New chat", description: "Same project", scope: "global", handler: createNewChat },
      { key: "ArrowLeft", alt: true, label: "Previous provider", scope: "new-chat", handler: () => cycleProvider(-1) },
      { key: "ArrowRight", alt: true, label: "Next provider", scope: "new-chat", handler: () => cycleProvider(1) },
      { key: "ArrowUp", alt: true, label: "Previous unread session", scope: "global", handler: () => moveToUnreadSession(-1) },
      { key: "ArrowDown", alt: true, label: "Next unread session", scope: "global", handler: () => moveToUnreadSession(1) },
    ]
  }, [state, composerState.provider, navigate, resetComposerFromProvider])

  const definitions = useShortcuts(registrations, activeScope)

  return (
    <ShortcutHelpOverlay
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      shortcuts={definitions}
    />
  )
}

function LegacySettingsRedirect() {
  const location = useLocation()

  return (
    <Navigate
      replace
      to={getLegacyTinkariaRedirectTarget({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      })}
    />
  )
}

function AppInner() {
  const location = useLocation()
  const activeChatId = location.pathname.startsWith("/chat/")
    ? location.pathname.slice("/chat/".length)
    : null
  const state = useAppState(activeChatId || null)

  return (
    <AppStateContext.Provider value={state}>
      <ShortcutController />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LocalProjectsPage />} />
          <Route path="/tinkaria/*" element={<TinkariaPage />} />
          <Route path="/settings/*" element={<LegacySettingsRedirect />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/workspace/:id" element={<WorkspacePage />} />
          <Route path="/project/:groupKey" element={<ProjectPage />} />
        </Route>
      </Routes>
    </AppStateContext.Provider>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <UiIdentityOverlayController />
      <AppDialogProvider>
        <AppInner />
      </AppDialogProvider>
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  )
}

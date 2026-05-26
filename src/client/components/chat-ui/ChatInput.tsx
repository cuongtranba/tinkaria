import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { ArrowUp, Check, ClockPlus, Loader2 } from "lucide-react"
import {
  type AgentProvider,
  type ClaudeModelOptions,
  type CodexModelOptions,
  type ModelOptions,
  type ProviderCatalogEntry,
  PROVIDERS,
  normalizeClaudeContextWindow,
} from "../../../shared/types"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { createUiIdentity, createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { getAwaitingChatComposerPlaceholderText, getChatComposerPlaceholderText } from "../../lib/quirkyCopy"
import { cn } from "../../lib/utils"
import { useIsStandalone } from "../../hooks/useIsStandalone"
import { useIsMobile } from "../../hooks/useIsMobile"
import { useChatInputStore } from "../../stores/chatInputStore"
import { type ComposerState, useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { useSkillCompositionStore, computeSkillInsertion, formatSkillCommand } from "../../stores/skillCompositionStore"
import { CHAT_INPUT_ATTRIBUTE, focusNextChatInput } from "../../app/chatFocusPolicy"
import { ChatPreferenceControls, type ModelOptionChange } from "./ChatPreferenceControls"
import { SkillRibbon } from "./SkillRibbon"
import type { SocketStatus } from "../../app/socket-interface"

const RECONNECT_SUCCESS_FADE_MS = 1200
const AWAITING_PLACEHOLDER_ROTATE_MS = 4000

type ComposerReconnectVisualState = "idle" | "reconnecting" | "reconnected"

interface Props {
  onSubmit: (
    value: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<"queued" | "sent">
  onCancel?: () => void
  queuedText?: string
  onClearQueuedText?: () => void
  onRestoreQueuedText?: () => string
  disabled: boolean
  canCancel?: boolean
  chatId?: string | null
  connectionStatus: SocketStatus
  activeProvider: AgentProvider | null
  runtimeModel?: string | null
  availableProviders: ProviderCatalogEntry[]
  availableSkills?: string[]
}

function areProviderCatalogEntriesEqual(previous: ProviderCatalogEntry[], next: ProviderCatalogEntry[]): boolean {
  if (previous.length !== next.length) return false
  for (let index = 0; index < previous.length; index += 1) {
    const previousEntry = previous[index]
    const nextEntry = next[index]
    if (
      previousEntry.id !== nextEntry.id
      || previousEntry.label !== nextEntry.label
      || previousEntry.supportsPlanMode !== nextEntry.supportsPlanMode
      || previousEntry.models.length !== nextEntry.models.length
    ) {
      return false
    }

    for (let modelIndex = 0; modelIndex < previousEntry.models.length; modelIndex += 1) {
      const previousModel = previousEntry.models[modelIndex]
      const nextModel = nextEntry.models[modelIndex]
      if (
        previousModel.id !== nextModel.id
        || previousModel.label !== nextModel.label
        || previousModel.contextWindowOptions?.join(",") !== nextModel.contextWindowOptions?.join(",")
      ) {
        return false
      }
    }
  }
  return true
}

function areStringsEqual(previous: string[] | undefined, next: string[] | undefined): boolean {
  const previousValue = previous ?? []
  const nextValue = next ?? []
  if (previousValue.length !== nextValue.length) return false
  for (let index = 0; index < previousValue.length; index += 1) {
    if (previousValue[index] !== nextValue[index]) return false
  }
  return true
}

export function areChatInputPropsEqual(previous: Props, next: Props): boolean {
  return previous.queuedText === next.queuedText
    && previous.disabled === next.disabled
    && previous.canCancel === next.canCancel
    && previous.chatId === next.chatId
    && previous.connectionStatus === next.connectionStatus
    && previous.activeProvider === next.activeProvider
    && previous.runtimeModel === next.runtimeModel
    && areProviderCatalogEntriesEqual(previous.availableProviders, next.availableProviders)
    && areStringsEqual(previous.availableSkills, next.availableSkills)
}

function withNormalizedContextWindow(
  state: ComposerState,
  model: string
): ComposerState {
  if (state.provider !== "claude") return { ...state, model }
  return {
    ...state,
    model,
    modelOptions: {
      ...state.modelOptions,
      contextWindow: normalizeClaudeContextWindow(model, state.modelOptions.contextWindow),
    },
  }
}

function logChatInput(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[ChatInput] ${message}`)
    return
  }

  console.info(`[ChatInput] ${message}`, details)
}

function createLockedComposerState(
  provider: AgentProvider,
  composerState: ComposerState,
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"],
  runtimeModel?: string | null
): ComposerState {
  if (provider === "claude") {
    if (composerState.provider === "claude") {
      return {
        provider: "claude",
        model: runtimeModel ?? composerState.model,
        modelOptions: { ...composerState.modelOptions },
        planMode: composerState.planMode,
      }
    }

    return {
      provider: "claude",
      model: runtimeModel ?? providerDefaults.claude.model,
      modelOptions: { ...providerDefaults.claude.modelOptions },
      planMode: providerDefaults.claude.planMode,
    }
  }

  if (composerState.provider === "codex") {
    return {
      provider: "codex",
      model: runtimeModel ?? composerState.model,
      modelOptions: { ...composerState.modelOptions },
      planMode: composerState.planMode,
    }
  }

  return {
    provider: "codex",
    model: runtimeModel ?? providerDefaults.codex.model,
    modelOptions: { ...providerDefaults.codex.modelOptions },
    planMode: providerDefaults.codex.planMode,
  }
}

export function resolvePlanModeState(args: {
  providerLocked: boolean
  planMode: boolean
  selectedProvider: AgentProvider
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  lockedComposerState: ComposerState | null
}) {
  if (!args.providerLocked) {
    return {
      composerPlanMode: args.planMode,
      lockedComposerState: args.lockedComposerState,
    }
  }

  const nextLockedState = args.lockedComposerState
    ?? createLockedComposerState(args.selectedProvider, args.composerState, args.providerDefaults)

  return {
    composerPlanMode: args.composerState.planMode,
    lockedComposerState: {
      ...nextLockedState,
      planMode: args.planMode,
    } satisfies ComposerState,
  }
}

export function shouldShowQueuedBlock(queuedText: string): boolean {
  return queuedText.trim().length > 0
}

export function shouldShowQueueAction(canCancel: boolean): boolean {
  return canCancel
}

export function hasTrimmedText(value: string): boolean {
  return value.trim().length > 0
}

export function getQueueActionDisabledState(args: { disabled: boolean; value: string }): boolean {
  return args.disabled || !hasTrimmedText(args.value)
}

export function getComposerActionDisabledState(args: {
  disabled: boolean
  reconnectVisualState: ComposerReconnectVisualState
}): boolean {
  return args.disabled || args.reconnectVisualState !== "idle"
}

export function shouldQueueOnSubmitKeystroke(args: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  canCancel: boolean | undefined
  isTouchDevice: boolean
}): boolean {
  if (args.key !== "Enter" || args.shiftKey) return false
  if (!args.canCancel) return false
  return args.metaKey || args.ctrlKey || !args.isTouchDevice
}

export function shouldInvokeCancelAction(
  eventType: "pointerdown" | "click",
  pointerTriggeredRef: { current: boolean }
): boolean {
  if (eventType === "pointerdown") {
    pointerTriggeredRef.current = true
    return true
  }

  if (pointerTriggeredRef.current) {
    pointerTriggeredRef.current = false
    return false
  }

  return true
}

export function getRestoredQueuedTextOnArrowUp(value: string, queuedText: string): string | null {
  if (hasTrimmedText(value)) return null
  return hasTrimmedText(queuedText) ? queuedText : null
}

export function shouldClearDraftAfterSubmit(submitResult: "queued" | "sent"): boolean {
  return submitResult === "queued" || submitResult === "sent"
}

export function getComposerControlsKey(chatId: string | null | undefined, activeProvider: AgentProvider | null): string {
  return `${chatId ?? "__new__"}:${activeProvider ?? "unlocked"}`
}

export function resolveComposerPreferences(args: {
  activeProvider: AgentProvider | null
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  lockedOverrides: ComposerState | null
  runtimeModel?: string | null
}) {
  const providerLocked = args.activeProvider !== null
  const selectedProvider = args.activeProvider ?? args.composerState.provider
  const lockedBaseState = args.activeProvider
    ? createLockedComposerState(args.activeProvider, args.composerState, args.providerDefaults, args.runtimeModel)
    : null
  const providerPrefs = providerLocked
    ? args.lockedOverrides ?? lockedBaseState ?? args.composerState
    : args.composerState
  const providerConfig = PROVIDERS.find((provider) => provider.id === selectedProvider) ?? PROVIDERS[0]

  return {
    providerLocked,
    selectedProvider,
    lockedBaseState,
    providerPrefs,
    showPlanMode: providerConfig?.supportsPlanMode ?? false,
  }
}

interface ComposerPreferencesSnapshot {
  selectedProvider: AgentProvider
  providerPrefs: ComposerState
  showPlanMode: boolean
}

interface ComposerPreferencesHandle {
  getSnapshot: () => ComposerPreferencesSnapshot
  setPlanMode: (planMode: boolean) => void
}

interface ComposerPreferencesProps {
  activeProvider: AgentProvider | null
  runtimeModel?: string | null
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  availableProviders: ProviderCatalogEntry[]
  availableSkills: string[]
  ribbonVisible: boolean
  toggleRibbon: () => void
  setComposerModel: (model: string) => void
  setComposerModelOptions: (modelOptions: Partial<ClaudeModelOptions> | Partial<CodexModelOptions>) => void
  setComposerPlanMode: (planMode: boolean) => void
  resetComposerFromProvider: (provider: AgentProvider) => void
}

const ComposerPreferenceControls = memo(forwardRef<ComposerPreferencesHandle, ComposerPreferencesProps>(function ComposerPreferenceControls({
  activeProvider,
  runtimeModel,
  composerState,
  providerDefaults,
  availableProviders,
  availableSkills,
  ribbonVisible,
  toggleRibbon,
  setComposerModel,
  setComposerModelOptions,
  setComposerPlanMode,
  resetComposerFromProvider,
}, forwardedRef) {
  const [lockedOverrides, setLockedOverrides] = useState<ComposerState | null>(null)
  const resolved = resolveComposerPreferences({
    activeProvider,
    composerState,
    providerDefaults,
    lockedOverrides,
    runtimeModel,
  })
  const providerConfig = availableProviders.find((provider) => provider.id === resolved.selectedProvider) ?? availableProviders[0]
  const showPlanMode = providerConfig?.supportsPlanMode ?? false

  const handleProviderChange = useCallback((provider: AgentProvider) => {
    if (resolved.providerLocked) return
    resetComposerFromProvider(provider)
  }, [resolved.providerLocked, resetComposerFromProvider])

  const handleModelChange = useCallback((_: AgentProvider, model: string) => {
    if (resolved.providerLocked) {
      setLockedOverrides((current) => {
        const next = current ?? resolved.lockedBaseState ?? createLockedComposerState(resolved.selectedProvider, composerState, providerDefaults)
        return withNormalizedContextWindow(next, model)
      })
      return
    }
    setComposerModel(model)
  }, [resolved.providerLocked, resolved.lockedBaseState, resolved.selectedProvider, composerState, providerDefaults, setComposerModel])

  const handleModelOptionChange = useCallback((change: ModelOptionChange) => {
    const doUpdate = (
      transform: (s: ComposerState) => ComposerState,
      fallback: () => void
    ) => {
      if (resolved.providerLocked) {
        setLockedOverrides((current) => {
          const next = current ?? resolved.lockedBaseState ?? createLockedComposerState(resolved.selectedProvider, composerState, providerDefaults)
          return transform(next)
        })
        return
      }
      fallback()
    }

    switch (change.type) {
      case "claudeReasoningEffort":
      case "codexReasoningEffort":
        doUpdate(
          (state) => ({
            ...state,
            modelOptions: { ...state.modelOptions, reasoningEffort: change.effort },
          } as ComposerState),
          () => setComposerModelOptions({ reasoningEffort: change.effort })
        )
        break
      case "contextWindow":
        doUpdate(
          (state) => state.provider !== "claude"
            ? state
            : withNormalizedContextWindow(
                { ...state, modelOptions: { ...state.modelOptions, contextWindow: change.contextWindow } },
                state.model
              ),
          () => setComposerModelOptions({ contextWindow: change.contextWindow })
        )
        break
      case "fastMode":
        doUpdate(
          (state) => state.provider === "claude"
            ? state
            : { ...state, modelOptions: { ...state.modelOptions, fastMode: change.fastMode } },
          () => setComposerModelOptions({ fastMode: change.fastMode })
        )
        break
    }
  }, [resolved.providerLocked, resolved.lockedBaseState, resolved.selectedProvider, composerState, providerDefaults, setComposerModelOptions])

  const handlePlanModeChange = useCallback((planMode: boolean) => {
    const nextState = resolvePlanModeState({
      providerLocked: resolved.providerLocked,
      planMode,
      selectedProvider: resolved.selectedProvider,
      composerState,
      providerDefaults,
      lockedComposerState: lockedOverrides,
    })

    if (resolved.providerLocked) {
      setLockedOverrides(nextState.lockedComposerState)
      return
    }

    if (nextState.composerPlanMode !== composerState.planMode) {
      setComposerPlanMode(nextState.composerPlanMode)
    }
  }, [resolved.providerLocked, resolved.selectedProvider, composerState, providerDefaults, lockedOverrides, setComposerPlanMode])

  useImperativeHandle(forwardedRef, () => ({
    getSnapshot: () => ({
      selectedProvider: resolved.selectedProvider,
      providerPrefs: resolved.providerPrefs,
      showPlanMode,
    }),
    setPlanMode: handlePlanModeChange,
  }), [resolved.selectedProvider, resolved.providerPrefs, showPlanMode, handlePlanModeChange])

  const handleModelDoubleTap = useCallback(() => {
    const provider = resolved.selectedProvider
    const catalog = PROVIDERS.find((p) => p.id === provider)
    if (!catalog) return
    const models = catalog.models
    const currentIndex = models.findIndex((m) => m.id === resolved.providerPrefs.model)
    const nextIndex = (currentIndex + 1) % models.length
    handleModelChange(provider, models[nextIndex].id)
  }, [resolved.selectedProvider, resolved.providerPrefs.model, handleModelChange])

  return (
    <ChatPreferenceControls
      availableProviders={availableProviders}
      selectedProvider={resolved.selectedProvider}
      providerLocked={resolved.providerLocked}
      model={resolved.providerPrefs.model}
      modelOptions={resolved.providerPrefs.modelOptions}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onModelDoubleTap={handleModelDoubleTap}
      onModelOptionChange={handleModelOptionChange}
      planMode={resolved.providerPrefs.planMode}
      onPlanModeChange={handlePlanModeChange}
      includePlanMode={showPlanMode}
      showSkillsToggle={availableSkills.length > 0}
      skillsVisible={ribbonVisible}
      onSkillsToggle={toggleRibbon}
      className="max-w-[840px] mx-auto"
    />
  )
}))

const ChatInputInner = forwardRef<HTMLTextAreaElement, Props>(function ChatInput({
  onSubmit,
  onCancel,
  queuedText = "",
  onClearQueuedText,
  onRestoreQueuedText,
  disabled,
  canCancel,
  chatId,
  connectionStatus,
  activeProvider,
  runtimeModel,
  availableProviders,
  availableSkills = [],
}, forwardedRef) {
  const getDraft = useChatInputStore((s) => s.getDraft)
  const setDraft = useChatInputStore((s) => s.setDraft)
  const clearDraft = useChatInputStore((s) => s.clearDraft)
  const composerState = useChatPreferencesStore((s) => s.composerState)
  const providerDefaults = useChatPreferencesStore((s) => s.providerDefaults)
  const setComposerModel = useChatPreferencesStore((s) => s.setComposerModel)
  const setComposerModelOptions = useChatPreferencesStore((s) => s.setComposerModelOptions)
  const setComposerPlanMode = useChatPreferencesStore((s) => s.setComposerPlanMode)
  const resetComposerFromProvider = useChatPreferencesStore((s) => s.resetComposerFromProvider)
  const ribbonVisible = useSkillCompositionStore((s) => s.ribbonVisible)
  const toggleRibbon = useSkillCompositionStore((s) => s.toggleRibbon)
  const recordUsage = useSkillCompositionStore((s) => s.recordUsage)
  const initialDraft = chatId ? getDraft(chatId) : ""
  const draftValueRef = useRef(initialDraft)
  const [hasText, setHasText] = useState(() => hasTrimmedText(initialDraft))
  const [awaitingPlaceholderStep, setAwaitingPlaceholderStep] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerPreferencesRef = useRef<ComposerPreferencesHandle>(null)
  const isStandalone = useIsStandalone()
  const isMobile = useIsMobile()
  const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  const composerPlaceholder = canCancel
    ? getAwaitingChatComposerPlaceholderText(chatId, awaitingPlaceholderStep)
    : getChatComposerPlaceholderText(chatId)
  const composerControlsKey = getComposerControlsKey(chatId, activeProvider)
  const composerAreaId = createUiIdentity("chat.composer", "area")
  const submitActionId = createUiIdentity("chat.composer.submit", "action")
  const cancelActionId = createUiIdentity("chat.composer.cancel", "action")
  const queueActionId = createUiIdentity("chat.composer.queue", "action")
  const composerAreaDescriptor = createUiIdentityDescriptor({
    id: composerAreaId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const submitActionDescriptor = createUiIdentityDescriptor({
    id: submitActionId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const cancelActionDescriptor = createUiIdentityDescriptor({
    id: cancelActionId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const queueActionDescriptor = createUiIdentityDescriptor({
    id: queueActionId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const connectionBadgeId = createUiIdentity("chat.composer.connection", "section")
  const connectionBadgeDescriptor = createUiIdentityDescriptor({
    id: connectionBadgeId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const [reconnectVisualState, setReconnectVisualState] = useState<ComposerReconnectVisualState>(() => (
    connectionStatus === "connected" ? "idle" : "reconnecting"
  ))
  const hasConnectedRef = useRef(connectionStatus === "connected")
  const cancelPointerTriggeredRef = useRef(false)

  function getComposerSnapshot() {
    return composerPreferencesRef.current?.getSnapshot() ?? resolveComposerPreferences({
      activeProvider,
      composerState,
      providerDefaults,
      lockedOverrides: null,
      runtimeModel,
    })
  }

  function setComposerPlanModeFromComposer(planMode: boolean) {
    composerPreferencesRef.current?.setPlanMode(planMode)
  }

  const autoResize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
    if (element.value.length === 0) {
      element.style.height = ""
      return
    }
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [])

  const syncDraftValue = useCallback((nextValue: string) => {
    draftValueRef.current = nextValue
    const nextHasText = hasTrimmedText(nextValue)
    setHasText((current) => (current === nextHasText ? current : nextHasText))
    if (chatId) setDraft(chatId, nextValue)
  }, [chatId, setDraft])

  const setComposerValue = useCallback((nextValue: string) => {
    const textarea = textareaRef.current
    if (textarea && textarea.value !== nextValue) {
      textarea.value = nextValue
    }
    syncDraftValue(nextValue)
    autoResize()
  }, [autoResize, syncDraftValue])

  const setTextareaRefs = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node

    if (!forwardedRef) return
    if (typeof forwardedRef === "function") {
      forwardedRef(node)
      return
    }

    forwardedRef.current = node
  }, [forwardedRef])

  useEffect(() => {
    window.addEventListener("resize", autoResize)
    return () => window.removeEventListener("resize", autoResize)
  }, [autoResize])

  useEffect(() => {
    if (!isTouchDevice) textareaRef.current?.focus()
  }, [chatId, isTouchDevice])

  useEffect(() => {
    if (!canCancel) {
      setAwaitingPlaceholderStep(0)
      return
    }

    setAwaitingPlaceholderStep(0)
    const intervalId = window.setInterval(() => {
      setAwaitingPlaceholderStep((step) => step + 1)
    }, AWAITING_PLACEHOLDER_ROTATE_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [canCancel, chatId])

  useEffect(() => {
    if (connectionStatus !== "connected") {
      setReconnectVisualState("reconnecting")
      return
    }

    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true
      setReconnectVisualState("idle")
      return
    }

    if (reconnectVisualState !== "reconnecting") {
      setReconnectVisualState("idle")
      return
    }

    setReconnectVisualState("reconnected")
    const timeoutId = window.setTimeout(() => {
      setReconnectVisualState("idle")
    }, RECONNECT_SUCCESS_FADE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [connectionStatus, reconnectVisualState])

  const resolvedProvider = activeProvider ?? composerState.provider

  function handleSkillInsert(skill: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    const command = formatSkillCommand(skill, resolvedProvider)
    const { value: nextValue, cursorPosition } = computeSkillInsertion(
      draftValueRef.current,
      textarea.selectionStart,
      textarea.selectionEnd,
      command
    )
    setComposerValue(nextValue)
    recordUsage([skill])
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.selectionStart = cursorPosition
      textarea.selectionEnd = cursorPosition
    })
  }

  async function handleSubmit() {
    const rawValue = draftValueRef.current
    if (!hasTrimmedText(rawValue)) return
    const composerSnapshot = getComposerSnapshot()
    let modelOptions: ModelOptions

    if (composerSnapshot.providerPrefs.provider === "claude") {
      modelOptions = { claude: { ...composerSnapshot.providerPrefs.modelOptions } }
    } else {
      modelOptions = { codex: { ...composerSnapshot.providerPrefs.modelOptions } }
    }
    const submitOptions = {
      provider: composerSnapshot.selectedProvider,
      model: composerSnapshot.providerPrefs.model,
      modelOptions,
      planMode: composerSnapshot.showPlanMode ? composerSnapshot.providerPrefs.planMode : false,
    }
    logChatInput("submit settings", {
      chatId: chatId ?? null,
      activeProvider,
      composerProvider: composerSnapshot.providerPrefs.provider,
      submitOptions,
    })

    setComposerValue("")

    try {
      const submitResult = await onSubmit(rawValue, submitOptions)
      if (shouldClearDraftAfterSubmit(submitResult)) {
        if (chatId) clearDraft(chatId)
      }
    } catch (error) {
      console.error("[ChatInput] Submit failed:", error)
      setComposerValue(rawValue)
    }
  }

  function handleRestoreQueuedText() {
    const preservedDraft = draftValueRef.current
    const restored = onRestoreQueuedText?.()
    const nextValue = preservedDraft || restored
    if (!nextValue) return
    setComposerValue(nextValue)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  function handleClearQueuedText() {
    onClearQueuedText?.()
    if (chatId) clearDraft(chatId)
  }

  function handleQueueAction() {
    if (getQueueActionDisabledState({ disabled, value: draftValueRef.current })) return
    void handleSubmit()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowUp") {
      const restored = getRestoredQueuedTextOnArrowUp(draftValueRef.current, queuedText)
      if (restored) {
        event.preventDefault()
        handleRestoreQueuedText()
        return
      }
    }

    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault()
      focusNextChatInput(textareaRef.current, document)
      return
    }

    if (event.key === "Tab" && event.shiftKey) {
      const composerSnapshot = getComposerSnapshot()
      if (composerSnapshot.showPlanMode) {
        event.preventDefault()
        setComposerPlanModeFromComposer(!composerSnapshot.providerPrefs.planMode)
        return
      }
    }

    if (event.key === "Escape" && canCancel) {
      event.preventDefault()
      onCancel?.()
      return
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !canCancel) {
      event.preventDefault()
      void handleSubmit()
      return
    }

    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0
    if (shouldQueueOnSubmitKeystroke({
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      canCancel,
      isTouchDevice,
    })) {
      event.preventDefault()
      handleQueueAction()
      return
    }

    if (event.key === "Enter" && !event.shiftKey && !canCancel && !isTouchDevice) {
      event.preventDefault()
      void handleSubmit()
    }
  }
  const showQueueAction = shouldShowQueueAction(Boolean(canCancel))
  const composerActionsDisabled = getComposerActionDisabledState({
    disabled: disabled || connectionStatus !== "connected",
    reconnectVisualState,
  })
  const cancelActionDisabled = reconnectVisualState !== "idle" || connectionStatus !== "connected"
  const queueActionDisabled = composerActionsDisabled || !hasText
  const submitActionDisabled = composerActionsDisabled || !hasText
  const showConnectionBadge = reconnectVisualState === "reconnected"
  const preferenceControls = (
    <ComposerPreferenceControls
      key={composerControlsKey}
      ref={composerPreferencesRef}
      activeProvider={activeProvider}
      runtimeModel={runtimeModel}
      composerState={composerState}
      providerDefaults={providerDefaults}
      availableProviders={availableProviders}
      availableSkills={availableSkills}
      ribbonVisible={ribbonVisible}
      toggleRibbon={toggleRibbon}
      setComposerModel={setComposerModel}
      setComposerModelOptions={setComposerModelOptions}
      setComposerPlanMode={setComposerPlanMode}
      resetComposerFromProvider={resetComposerFromProvider}
    />
  )
  return (
    <div>
      {shouldShowQueuedBlock(queuedText) ? (
        <div className={cn("px-3 pb-2", isStandalone && "px-5")}>
          <div className="max-w-[840px] mx-auto rounded-[26px] border border-dashed border-amber-400/50 bg-amber-50/80 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm dark:border-amber-300/30 dark:bg-amber-500/10">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                <ClockPlus className="h-3.5 w-3.5" />
                Queued
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearQueuedText}>
                Clear
              </Button>
            </div>
            <div>{queuedText}</div>
          </div>
        </div>
      ) : null}
      {availableSkills.length > 0 && ribbonVisible ? (
        <div className={cn("px-3", isStandalone && "px-5")}>
          <div className="max-w-[840px] mx-auto">
            <SkillRibbon
              skills={availableSkills}
              provider={resolvedProvider}
              visible={ribbonVisible}
              onToggle={toggleRibbon}
              onInsert={handleSkillInsert}
              showToggle={false}
              contentClassName="pr-0"
            />
          </div>
        </div>
      ) : null}
      <div className={cn("px-3 pt-0", isStandalone && "px-5")}>
        <div
          {...getUiIdentityAttributeProps(composerAreaDescriptor)}
          className={cn(
            "max-w-[840px] mx-auto rounded-[29px] border pr-1.5 dark:bg-card/40 backdrop-blur-lg transition-[border-color,box-shadow] duration-300",
            reconnectVisualState === "reconnecting" && "border-amber-400/30",
            reconnectVisualState === "reconnected" && "border-emerald-400/30",
            reconnectVisualState === "idle" && !canCancel && "border-border",
            reconnectVisualState === "idle" && canCancel && "animate-composer-running",
          )}
        >
          <div className="flex flex-col gap-1.5">
            {showConnectionBadge ? (
              <div className="flex justify-end pt-1.5 pr-3">
                <div
                  {...getUiIdentityAttributeProps(connectionBadgeDescriptor)}
                  className="inline-flex items-center transition-opacity duration-300 text-emerald-600 dark:text-emerald-300/60 opacity-60"
                >
                  <Check className="h-3 w-3" />
                </div>
              </div>
            ) : null}
            <div className="flex min-w-0 items-end gap-2">
              {isMobile ? (
                <div className="mb-1 shrink-0">{preferenceControls}</div>
              ) : null}
              <Textarea
                ref={setTextareaRefs}
                placeholder={composerPlaceholder}
                defaultValue={initialDraft}
                autoFocus={!isTouchDevice}
                {...{ [CHAT_INPUT_ATTRIBUTE]: "" }}
                rows={1}
                onChange={(event) => {
                  syncDraftValue(event.target.value)
                  autoResize()
                }}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={cn(
                  "tinkaria-composer-placeholder min-w-0 flex-1 text-base p-3 md:p-4 pl-4.5 md:pl-6 resize-none max-h-[200px] outline-none bg-transparent border-0 shadow-none",
                  canCancel && "tinkaria-composer-placeholder-rotating"
                )}
              />
              {showQueueAction ? (
                <div className="flex-shrink-0 mb-1 -mr-0.5 flex items-center gap-1.5 md:gap-2 md:mr-0 md:mb-1.5">
                  <Button
                    {...getUiIdentityAttributeProps(cancelActionDescriptor)}
                    type="button"
                    aria-label="Stop"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      if (!shouldInvokeCancelAction("pointerdown", cancelPointerTriggeredRef)) return
                      onCancel?.()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      if (!shouldInvokeCancelAction("click", cancelPointerTriggeredRef)) return
                      onCancel?.()
                    }}
                    disabled={cancelActionDisabled}
                    size="icon"
                    className={cn(
                      "flex-shrink-0 rounded-full h-10 w-10 md:h-11 md:w-11 touch-manipulation transition-colors",
                      "bg-slate-600 text-white dark:bg-white dark:text-slate-900",
                      reconnectVisualState === "reconnecting" && "disabled:opacity-60",
                    )}
                  >
                    <div className="w-3 h-3 md:w-4 md:h-4 rounded-xs bg-current" />
                  </Button>
                  <Button
                    {...getUiIdentityAttributeProps(queueActionDescriptor)}
                    type="button"
                    aria-label="Queue"
                    title="Queue"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      handleQueueAction()
                    }}
                    disabled={queueActionDisabled}
                    size="icon"
                    className={cn(
                      "flex-shrink-0 h-10 w-10 rounded-full md:h-11 md:w-11 transition-colors",
                      reconnectVisualState === "reconnecting" && "disabled:opacity-60",
                    )}
                  >
                    <ClockPlus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  {...getUiIdentityAttributeProps(submitActionDescriptor)}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    if (!submitActionDisabled && hasTrimmedText(draftValueRef.current)) {
                      void handleSubmit()
                    }
                  }}
                  disabled={submitActionDisabled}
                  size="icon"
                  className={cn(
                    "flex-shrink-0 rounded-full h-10 w-10 md:h-11 md:w-11 mb-1 -mr-0.5 md:mr-0 md:mb-1.5 touch-manipulation transition-colors",
                    "bg-slate-600 text-white dark:bg-white dark:text-slate-900 disabled:bg-white/60 disabled:text-slate-700",
                    reconnectVisualState === "reconnecting" && "disabled:opacity-60",
                  )}
                >
                  {reconnectVisualState === "reconnecting" ? (
                    <Loader2 className="h-5 w-5 animate-spin md:h-6 md:w-6" />
                  ) : reconnectVisualState === "reconnected" ? (
                    <Check className="h-5 w-5 md:h-6 md:w-6" />
                  ) : (
                    <ArrowUp className="h-5 w-5 md:h-6 md:w-6" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      {!isMobile ? (
        <div className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-3 flex flex-row", isStandalone && "p-5 pt-3")}>
          <div className="min-w-3"/>
          {preferenceControls}
          <div className="min-w-3"/>
        </div>
      ) : null}
    </div>
  )
})

export const ChatInput = memo(ChatInputInner, areChatInputPropsEqual)

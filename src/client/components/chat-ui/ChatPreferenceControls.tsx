import { memo, useState } from "react"
import { ArrowLeft, Box, Brain, ChevronRight, Gauge, ListTodo, LockOpen, Sparkles, SquareMenu, SquareMinus } from "lucide-react"
import {
  CLAUDE_CONTEXT_WINDOW_OPTIONS,
  CLAUDE_REASONING_OPTIONS,
  CODEX_REASONING_OPTIONS,
  type AgentProvider,
  type ClaudeContextWindow,
  type ClaudeModelOptions,
  type ClaudeReasoningEffort,
  type CodexModelOptions,
  type CodexReasoningEffort,
  type ProviderCatalogEntry,
} from "../../../shared/types"
import { createUiIdentity, createUiIdentityDescriptor, getUiIdentityAttributeProps, type UiIdentityDescriptor } from "../../lib/uiIdentityOverlay"
import { useIsMobile } from "../../hooks/useIsMobile"
import { cn } from "../../lib/utils"
import { PROVIDER_ICONS } from "../icons/ProviderIcons"
export { PROVIDER_ICONS }
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Button } from "../ui/button"

export function PopoverMenuItem({
  onClick,
  selected,
  icon,
  label,
  description,
  disabled,
  trailing,
}: {
  onClick: () => void
  selected: boolean
  icon: React.ReactNode
  label: string
  description?: string
  disabled?: boolean
  trailing?: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 p-2 border border-border/0 rounded-lg text-left h-auto justify-start transition-opacity",
        selected ? "bg-muted border-border" : "hover:opacity-60",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </div>
      {trailing ? <span className="ml-auto shrink-0 text-muted-foreground">{trailing}</span> : null}
    </Button>
  )
}

export function InputPopover({
  trigger,
  triggerClassName,
  disabled = false,
  triggerUiId,
  contentUiId,
  onDoubleTap,
  children,
}: {
  trigger: React.ReactNode
  triggerClassName?: string
  disabled?: boolean
  triggerUiId?: string | UiIdentityDescriptor
  contentUiId?: string | UiIdentityDescriptor
  onDoubleTap?: () => void
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const [open, setOpen] = useState(false)

  if (disabled) {
    return (
      <Button
        variant="ghost"
        {...(triggerUiId ? getUiIdentityAttributeProps(triggerUiId) : {})}
        disabled
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground [&>svg]:shrink-0 opacity-70 [&>span]:whitespace-nowrap h-auto",
          triggerClassName
        )}
      >
        {trigger}
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          {...(triggerUiId ? getUiIdentityAttributeProps(triggerUiId) : {})}
          onDoubleClick={onDoubleTap ? (e) => {
            e.preventDefault()
            setOpen(false)
            onDoubleTap()
          } : undefined}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground [&>svg]:shrink-0 [&>span]:whitespace-nowrap h-auto",
            triggerClassName
          )}
        >
          {trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...(contentUiId ? getUiIdentityAttributeProps(contentUiId) : {})}
        align="center"
        className="w-64 p-1"
      >
        <div className="space-y-1">{typeof children === "function" ? children(() => setOpen(false)) : children}</div>
      </PopoverContent>
    </Popover>
  )
}

export type ModelOptionChange =
  | { type: "claudeReasoningEffort"; effort: ClaudeReasoningEffort }
  | { type: "contextWindow"; contextWindow: ClaudeContextWindow }
  | { type: "codexReasoningEffort"; effort: CodexReasoningEffort }
  | { type: "fastMode"; fastMode: boolean }

type MobileCategoryKey = "provider" | "model" | "reasoning" | "context" | "fastMode" | "mode"

interface MobileCategory {
  key: MobileCategoryKey
  icon: React.ReactNode
  label: string
  value: string
  disabled?: boolean
  renderOptions: () => React.ReactNode
}

interface ChatPreferenceControlsProps {
  availableProviders: ProviderCatalogEntry[]
  selectedProvider: AgentProvider
  showProviderPicker?: boolean
  providerLocked?: boolean
  model: string
  modelOptions: ClaudeModelOptions | CodexModelOptions
  onProviderChange?: (provider: AgentProvider) => void
  onModelChange: (provider: AgentProvider, model: string) => void
  onModelDoubleTap?: () => void
  onModelOptionChange: (change: ModelOptionChange) => void
  planMode?: boolean
  onPlanModeChange?: (planMode: boolean) => void
  includePlanMode?: boolean
  showSkillsToggle?: boolean
  skillsVisible?: boolean
  onSkillsToggle?: () => void
  className?: string
}

export const ChatPreferenceControls = memo(function ChatPreferenceControls({
  availableProviders,
  selectedProvider,
  showProviderPicker = true,
  providerLocked = false,
  model,
  modelOptions,
  onProviderChange,
  onModelChange,
  onModelDoubleTap,
  onModelOptionChange,
  planMode = false,
  onPlanModeChange,
  includePlanMode = true,
  showSkillsToggle = false,
  skillsVisible = false,
  onSkillsToggle,
  className,
}: ChatPreferenceControlsProps) {
  const providerConfig = availableProviders.find((provider) => provider.id === selectedProvider) ?? availableProviders[0]
  const ProviderIcon = PROVIDER_ICONS[selectedProvider]
  const ModelIcon = Box
  const showPlanMode = includePlanMode && providerConfig?.supportsPlanMode && onPlanModeChange
  const claudeModelOptions = selectedProvider === "claude" ? modelOptions as ClaudeModelOptions : null
  const codexModelOptions = selectedProvider === "codex" ? modelOptions as CodexModelOptions : null
  const contextWindowOptions = providerConfig.models.find((candidate) => candidate.id === model)?.contextWindowOptions ?? []
  const selectedContextWindow = claudeModelOptions?.contextWindow ?? CLAUDE_CONTEXT_WINDOW_OPTIONS[0].id
  const ContextWindowIcon = selectedContextWindow === "1m" ? SquareMenu : SquareMinus
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuCategory, setMenuCategory] = useState<MobileCategoryKey | null>(null)
  const providerActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.provider", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const providerPopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.provider", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const modelActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.model", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const modelPopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.model", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const reasoningActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.reasoning", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const reasoningPopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.reasoning", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const contextWindowActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.context-window", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const contextWindowPopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.context-window", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const fastModeActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.fast-mode", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const fastModePopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.fast-mode", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const planModeActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.plan-mode", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const planModePopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.plan-mode", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const skillsToggleDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.skills.toggle", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const menuActionDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.menu", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const menuPopoverDescriptor = createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.menu", "popover"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })

  if (isMobile) {
    const modelLabel = providerConfig.models.find((candidate) => candidate.id === model)?.label ?? model
    const reasoningLabel = selectedProvider === "claude"
      ? CLAUDE_REASONING_OPTIONS.find((effort) => effort.id === modelOptions.reasoningEffort)?.label ?? modelOptions.reasoningEffort
      : CODEX_REASONING_OPTIONS.find((effort) => effort.id === modelOptions.reasoningEffort)?.label ?? modelOptions.reasoningEffort
    const closeMenu = () => {
      setMenuOpen(false)
      setMenuCategory(null)
    }

    const categories: MobileCategory[] = []
    if (showProviderPicker) {
      categories.push({
        key: "provider",
        icon: <ProviderIcon className="h-4 w-4 text-muted-foreground" />,
        label: "Provider",
        value: providerConfig?.label ?? selectedProvider,
        disabled: providerLocked || !onProviderChange,
        renderOptions: () => availableProviders.map((provider) => {
          const Icon = PROVIDER_ICONS[provider.id]
          return (
            <PopoverMenuItem
              key={provider.id}
              onClick={() => { onProviderChange?.(provider.id); closeMenu() }}
              selected={selectedProvider === provider.id}
              icon={<Icon className="h-4 w-4 text-muted-foreground" />}
              label={provider.label}
            />
          )
        }),
      })
    }
    categories.push({
      key: "model",
      icon: <ModelIcon className="h-4 w-4 text-muted-foreground" />,
      label: "Model",
      value: modelLabel,
      renderOptions: () => providerConfig.models.map((candidate) => (
        <PopoverMenuItem
          key={candidate.id}
          onClick={() => { onModelChange(selectedProvider, candidate.id); closeMenu() }}
          selected={model === candidate.id}
          icon={<Box className="h-4 w-4 text-muted-foreground" />}
          label={candidate.label}
          description={candidate.description}
        />
      )),
    })
    categories.push({
      key: "reasoning",
      icon: <Brain className="h-4 w-4 text-muted-foreground" />,
      label: "Reasoning",
      value: reasoningLabel,
      renderOptions: () => (
        selectedProvider === "claude"
          ? CLAUDE_REASONING_OPTIONS.map((effort) => (
            <PopoverMenuItem
              key={effort.id}
              onClick={() => { onModelOptionChange({ type: "claudeReasoningEffort", effort: effort.id }); closeMenu() }}
              selected={modelOptions.reasoningEffort === effort.id}
              icon={<Brain className="h-4 w-4 text-muted-foreground" />}
              label={effort.label}
              disabled={effort.id === "max" && model !== "opus"}
            />
          ))
          : CODEX_REASONING_OPTIONS.map((effort) => (
            <PopoverMenuItem
              key={effort.id}
              onClick={() => { onModelOptionChange({ type: "codexReasoningEffort", effort: effort.id }); closeMenu() }}
              selected={modelOptions.reasoningEffort === effort.id}
              icon={<Brain className="h-4 w-4 text-muted-foreground" />}
              label={effort.label}
            />
          ))
      ),
    })
    if (selectedProvider === "claude" && contextWindowOptions.length > 1) {
      categories.push({
        key: "context",
        icon: <ContextWindowIcon className="h-4 w-4 text-muted-foreground" />,
        label: "Context",
        value: contextWindowOptions.find((option) => option.id === selectedContextWindow)?.label ?? selectedContextWindow,
        renderOptions: () => contextWindowOptions.map((option) => (
          <PopoverMenuItem
            key={option.id}
            onClick={() => { onModelOptionChange({ type: "contextWindow", contextWindow: option.id }); closeMenu() }}
            selected={selectedContextWindow === option.id}
            icon={option.id === "1m"
              ? <SquareMenu className="h-4 w-4 text-muted-foreground" />
              : <SquareMinus className="h-4 w-4 text-muted-foreground" />}
            label={option.label}
            description={option.id === "1m" ? "Expanded context window" : "Standard context window"}
          />
        )),
      })
    }
    if (selectedProvider === "codex") {
      categories.push({
        key: "fastMode",
        icon: <Gauge className={cn("h-4 w-4 text-muted-foreground", !codexModelOptions?.fastMode && "-scale-x-100")} />,
        label: "Speed",
        value: codexModelOptions?.fastMode ? "Fast Mode" : "Standard",
        renderOptions: () => (
          <>
            <PopoverMenuItem
              onClick={() => { onModelOptionChange({ type: "fastMode", fastMode: false }); closeMenu() }}
              selected={!codexModelOptions?.fastMode}
              icon={<Gauge className="h-4 w-4 text-muted-foreground -scale-x-100" />}
              label="Standard"
            />
            <PopoverMenuItem
              onClick={() => { onModelOptionChange({ type: "fastMode", fastMode: true }); closeMenu() }}
              selected={Boolean(codexModelOptions?.fastMode)}
              icon={<Gauge className="h-4 w-4 text-muted-foreground" />}
              label="Fast Mode"
            />
          </>
        ),
      })
    }
    if (showPlanMode) {
      categories.push({
        key: "mode",
        icon: planMode ? <ListTodo className="h-4 w-4 text-muted-foreground" /> : <LockOpen className="h-4 w-4 text-muted-foreground" />,
        label: "Mode",
        value: planMode ? "Plan Mode" : "Full Access",
        renderOptions: () => (
          <>
            <PopoverMenuItem
              onClick={() => { onPlanModeChange(false); closeMenu() }}
              selected={!planMode}
              icon={<LockOpen className="h-4 w-4 text-muted-foreground" />}
              label="Full Access"
              description="Execution without approval"
            />
            <PopoverMenuItem
              onClick={() => { onPlanModeChange(true); closeMenu() }}
              selected={planMode}
              icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
              label="Plan Mode"
              description="Review a plan before execution"
            />
          </>
        ),
      })
    }

    const activeCategory = menuCategory ? categories.find((category) => category.key === menuCategory) ?? null : null
    const TriggerIcon = planMode ? ListTodo : ModelIcon
    const triggerColor = planMode
      ? "text-blue-400 dark:text-blue-300"
      : (selectedProvider === "codex" && codexModelOptions?.fastMode ? "text-emerald-500 dark:text-emerald-400" : undefined)

    return (
      <div className="flex items-center">
        <Popover
          open={menuOpen}
          onOpenChange={(open) => { setMenuOpen(open); if (!open) setMenuCategory(null) }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Composer settings — ${modelLabel}`}
              {...getUiIdentityAttributeProps(menuActionDescriptor)}
              className={cn(
                "shrink-0 rounded-full h-9 w-9 text-muted-foreground [&>svg]:shrink-0",
                triggerColor
              )}
            >
              <TriggerIcon className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            {...getUiIdentityAttributeProps(menuPopoverDescriptor)}
            align="center"
            className="w-64 p-1"
          >
            <div className="space-y-1">
              {activeCategory ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMenuCategory(null)}
                    className="w-full flex items-center gap-2 p-2 text-sm font-medium text-muted-foreground hover:opacity-60 transition-opacity"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{activeCategory.label}</span>
                  </button>
                  {activeCategory.renderOptions()}
                </>
              ) : (
                <>
                  {categories.map((category) => (
                    <PopoverMenuItem
                      key={category.key}
                      onClick={() => { if (!category.disabled) setMenuCategory(category.key) }}
                      disabled={category.disabled}
                      selected={false}
                      icon={category.icon}
                      label={category.label}
                      description={category.value}
                      trailing={category.disabled ? undefined : <ChevronRight className="h-4 w-4" />}
                    />
                  ))}
                  {showSkillsToggle ? (
                    <PopoverMenuItem
                      onClick={() => { onSkillsToggle?.(); closeMenu() }}
                      selected={Boolean(skillsVisible)}
                      icon={<Sparkles className={cn("h-4 w-4 text-muted-foreground", skillsVisible && "text-amber-600 dark:text-amber-400")} />}
                      label="Skills"
                      description={skillsVisible ? "Shown" : "Hidden"}
                    />
                  ) : null}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  return (
    <div className={cn("flex md:justify-center items-center gap-0.5", className)}>
      {showProviderPicker ? (
        <InputPopover
          disabled={providerLocked || !onProviderChange}
          triggerUiId={providerActionDescriptor}
          contentUiId={providerPopoverDescriptor}
          trigger={(
            <>
              <ProviderIcon className="h-3.5 w-3.5" />
              <span>{providerConfig?.label ?? selectedProvider}</span>
            </>
          )}
        >
          {(close) => availableProviders.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.id]
            return (
              <PopoverMenuItem
                key={provider.id}
                onClick={() => {
                  onProviderChange?.(provider.id)
                  close()
                }}
                selected={selectedProvider === provider.id}
                icon={<Icon className="h-4 w-4 text-muted-foreground" />}
                label={provider.label}
              />
            )
          })}
        </InputPopover>
      ) : null}

      <InputPopover
        triggerUiId={modelActionDescriptor}
        contentUiId={modelPopoverDescriptor}
        onDoubleTap={onModelDoubleTap}
        trigger={(
          <>
            <ModelIcon className="h-3.5 w-3.5" />
            <span>{providerConfig.models.find((candidate) => candidate.id === model)?.label ?? model}</span>
          </>
        )}
      >
        {(close) => providerConfig.models.map((candidate) => {
          const Icon = Box
          return (
            <PopoverMenuItem
              key={candidate.id}
              onClick={() => {
                onModelChange(selectedProvider, candidate.id)
                close()
              }}
              selected={model === candidate.id}
              icon={<Icon className="h-4 w-4 text-muted-foreground" />}
              label={candidate.label}
              description={candidate.description}
            />
          )
        })}
      </InputPopover>

      {showSkillsToggle ? (
        <button
          type="button"
          onClick={onSkillsToggle}
          className={cn(
            "shrink-0 flex items-center gap-1 px-2 py-1 text-sm rounded-md transition-colors",
            "text-muted-foreground hover:bg-muted/50 [&>span]:whitespace-nowrap",
            skillsVisible && "text-amber-600 dark:text-amber-400"
          )}
          {...getUiIdentityAttributeProps(skillsToggleDescriptor)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Skills</span>
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", skillsVisible && "rotate-90")} />
        </button>
      ) : null}

      <InputPopover
        triggerUiId={reasoningActionDescriptor}
        contentUiId={reasoningPopoverDescriptor}
        trigger={(
          <>
            <Brain className="h-3.5 w-3.5" />
            <span>{
              selectedProvider === "claude"
                ? CLAUDE_REASONING_OPTIONS.find((effort) => effort.id === modelOptions.reasoningEffort)?.label ?? modelOptions.reasoningEffort
                : CODEX_REASONING_OPTIONS.find((effort) => effort.id === modelOptions.reasoningEffort)?.label ?? modelOptions.reasoningEffort
            }</span>
          </>
        )}
      >
        {(close) => (
          selectedProvider === "claude"
            ? CLAUDE_REASONING_OPTIONS.map((effort) => (
              <PopoverMenuItem
                key={effort.id}
                onClick={() => {
                  onModelOptionChange({ type: "claudeReasoningEffort", effort: effort.id })
                  close()
                }}
                selected={modelOptions.reasoningEffort === effort.id}
                icon={<Brain className="h-4 w-4 text-muted-foreground" />}
                label={effort.label}
                disabled={effort.id === "max" && model !== "opus"}
              />
            ))
            : CODEX_REASONING_OPTIONS.map((effort) => (
              <PopoverMenuItem
                key={effort.id}
                onClick={() => {
                  onModelOptionChange({ type: "codexReasoningEffort", effort: effort.id })
                  close()
                }}
                selected={modelOptions.reasoningEffort === effort.id}
                icon={<Brain className="h-4 w-4 text-muted-foreground" />}
                label={effort.label}
              />
            ))
        )}
      </InputPopover>

      {selectedProvider === "claude" && contextWindowOptions.length > 1 ? (
        <InputPopover
          triggerUiId={contextWindowActionDescriptor}
          contentUiId={contextWindowPopoverDescriptor}
          trigger={(
            <>
              <ContextWindowIcon className="h-3.5 w-3.5" />
              <span>{contextWindowOptions.find((option) => option.id === selectedContextWindow)?.label ?? selectedContextWindow}</span>
            </>
          )}
        >
          {(close) => contextWindowOptions.map((option) => (
            <PopoverMenuItem
              key={option.id}
                onClick={() => {
                  onModelOptionChange({ type: "contextWindow", contextWindow: option.id })
                  close()
                }}
                selected={selectedContextWindow === option.id}
                icon={option.id === "1m"
                  ? <SquareMenu className="h-4 w-4 text-muted-foreground" />
                  : <SquareMinus className="h-4 w-4 text-muted-foreground" />}
                label={option.label}
                description={option.id === "1m" ? "Expanded context window" : "Standard context window"}
              />
          ))}
        </InputPopover>
      ) : null}

      {selectedProvider === "codex" ? (
        <InputPopover
          triggerUiId={fastModeActionDescriptor}
          contentUiId={fastModePopoverDescriptor}
          trigger={(
            <>
              {codexModelOptions?.fastMode
                ? <Gauge className="h-3.5 w-3.5" />
                : <Gauge className="h-3.5 w-3.5 -scale-x-100" />}
              <span>{codexModelOptions?.fastMode ? "Fast Mode" : "Standard"}</span>
            </>
          )}
          triggerClassName={codexModelOptions?.fastMode ? "text-emerald-500 dark:text-emerald-400" : undefined}
        >
          {(close) => (
            <>
              <PopoverMenuItem
                onClick={() => {
                  onModelOptionChange({ type: "fastMode", fastMode: false })
                  close()
                }}
                selected={!codexModelOptions?.fastMode}
                icon={<Gauge className="h-4 w-4 text-muted-foreground -scale-x-100" />}
                label="Standard"
              />
              <PopoverMenuItem
                onClick={() => {
                  onModelOptionChange({ type: "fastMode", fastMode: true })
                  close()
                }}
                selected={Boolean(codexModelOptions?.fastMode)}
                icon={<Gauge className="h-4 w-4 text-muted-foreground" />}
                label="Fast Mode"
              />
            </>
          )}
        </InputPopover>
      ) : null}

      {showPlanMode ? (
        <InputPopover
          triggerUiId={planModeActionDescriptor}
          contentUiId={planModePopoverDescriptor}
          trigger={(
            <>
              {planMode ? <ListTodo className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              <span>{planMode ? "Plan Mode" : "Full Access"}</span>
            </>
          )}
          triggerClassName={planMode ? "text-blue-400 dark:text-blue-300" : undefined}
        >
          {(close) => (
            <>
              <PopoverMenuItem
                onClick={() => {
                  onPlanModeChange(false)
                  close()
                }}
                selected={!planMode}
                icon={<LockOpen className="h-4 w-4 text-muted-foreground" />}
                label="Full Access"
                description="Execution without approval"
              />
              <PopoverMenuItem
                onClick={() => {
                  onPlanModeChange(true)
                  close()
                }}
                selected={planMode}
                icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
                label="Plan Mode"
                description="Review a plan before execution"
              />
            </>
          )}
        </InputPopover>
      ) : null}

    </div>
  )
})

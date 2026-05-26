import { useState } from "react"
import { GitFork, Merge, PanelLeft } from "lucide-react"
import { Button } from "../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"
import {
  createC3UiIdentityDescriptor,
  createUiIdentity,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
import type { AgentProvider, CurrentRepoStatusSnapshot, DiscoveredSessionRuntime, SessionStatus } from "../../../shared/types"
import { PROVIDER_ICONS, getProviderFromModel } from "../icons/ProviderIcons"
import { PtyInstancesIndicator } from "./PtyInstancesIndicator"
import type { AppTransport } from "../../app/socket-interface"

interface Props {
  sidebarCollapsed: boolean
  onOpenSidebar: () => void
  onCollapseSidebar: () => void
  onExpandSidebar: () => void
  onForkSession: () => void
  onMergeSession: () => void
  localPath?: string
  currentSessionRuntime?: DiscoveredSessionRuntime | null
  currentRepoStatus?: CurrentRepoStatusSnapshot | null
  chatTitle?: string
  chatStatus?: SessionStatus
  runtimeModel?: string | null
  runtimeProvider?: AgentProvider | null
  socket?: AppTransport
  onOpenPtyChat?: (chatId: string) => void
}

function getPathLabel(localPath: string | undefined, repoStatus: CurrentRepoStatusSnapshot | null | undefined): string | null {
  const source = repoStatus?.localPath ?? localPath
  if (!source) return null
  const parts = source.split("/").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : source
}

function getCompactRepoLabel(
  pathLabel: string | null,
  repoStatus: CurrentRepoStatusSnapshot | null | undefined
): string | null {
  if (!pathLabel) return null

  const parts = [pathLabel]
  if (repoStatus?.branch) {
    let branchPart = repoStatus.branch
    if (repoStatus.ahead > 0) branchPart += ` +${repoStatus.ahead}`
    if (repoStatus.behind > 0) branchPart += ` -${repoStatus.behind}`
    parts.push(branchPart)
  }

  return parts.join(" \u00b7 ")
}

export function getContextBarColor(percent: number): string {
  if (percent >= 90) return "bg-red-500 dark:bg-red-400"
  if (percent >= 75) return "bg-orange-500 dark:bg-orange-400"
  if (percent >= 50) return "bg-amber-500 dark:bg-amber-400"
  return "bg-emerald-500 dark:bg-emerald-400"
}

function ContextBar({ percent, testId }: { percent: number; testId?: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0" data-testid={testId}>
      <span className={cn("text-xs font-medium leading-none tabular-nums", getContextPercentTextColor(percent))}>
        {percent}%
      </span>
      <div className="w-12 h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getContextBarColor(percent))}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}

export function getContextPercentTextColor(percent: number): string {
  if (percent >= 90) return "text-red-600 dark:text-red-400"
  if (percent >= 75) return "text-orange-600 dark:text-orange-400"
  if (percent >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

function RepoDetailPopover({
  localPath,
  repoStatus,
  compactLabel,
}: {
  localPath?: string
  repoStatus: CurrentRepoStatusSnapshot | null | undefined
  compactLabel: string
}) {
  const [open, setOpen] = useState(false)
  const fullPath = repoStatus?.localPath ?? localPath

  const hasDetails = Boolean(fullPath || repoStatus?.branch || repoStatus?.isRepo)
  if (!hasDetails) {
    return (
      <span className="truncate text-xs leading-none text-muted-foreground" title={compactLabel}>
        {compactLabel}
      </span>
    )
  }

  const changeCount = (repoStatus?.stagedCount ?? 0) + (repoStatus?.unstagedCount ?? 0) + (repoStatus?.untrackedCount ?? 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="truncate text-xs leading-none text-muted-foreground hover:text-foreground transition-colors cursor-default"
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
        >
          {compactLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-auto min-w-48 max-w-72 p-2.5"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-1.5 text-xs leading-relaxed">
          {fullPath ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Path</span>
              <span className="text-foreground font-medium truncate">{fullPath}</span>
            </div>
          ) : null}
          {repoStatus?.branch ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Branch</span>
              <span className="text-foreground font-medium">{repoStatus.branch}</span>
            </div>
          ) : null}
          {(repoStatus?.ahead ?? 0) > 0 || (repoStatus?.behind ?? 0) > 0 ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Sync</span>
              <span className="text-foreground font-medium">
                {repoStatus!.ahead > 0 ? `+${repoStatus!.ahead} ahead` : null}
                {repoStatus!.ahead > 0 && repoStatus!.behind > 0 ? ", " : null}
                {repoStatus!.behind > 0 ? `-${repoStatus!.behind} behind` : null}
              </span>
            </div>
          ) : null}
          {changeCount > 0 ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Changes</span>
              <span className="text-foreground font-medium">
                {[
                  repoStatus!.stagedCount > 0 ? `${repoStatus!.stagedCount} staged` : null,
                  repoStatus!.unstagedCount > 0 ? `${repoStatus!.unstagedCount} modified` : null,
                  repoStatus!.untrackedCount > 0 ? `${repoStatus!.untrackedCount} untracked` : null,
                ].filter(Boolean).join(", ")}
              </span>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getStatusDotClass(status: SessionStatus | undefined): string {
  switch (status) {
    case "running":
    case "starting":
      return "bg-emerald-500 animate-pulse"
    case "waiting_for_user":
      return "bg-amber-500"
    case "awaiting_agents":
      return "bg-blue-500 animate-pulse"
    case "failed":
      return "bg-red-500"
    default:
      return "bg-muted-foreground/40"
  }
}

const CHAT_NAVBAR_UI_DESCRIPTORS = {
  root: createC3UiIdentityDescriptor({
    id: "chat.navbar",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  area: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.navbar", "area"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  forkSessionAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.navbar.fork-session", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  mergeSessionAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.navbar.merge-session", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
} as const

const CHAT_NAVBAR_UI_IDENTITIES = getUiIdentityIdMap(CHAT_NAVBAR_UI_DESCRIPTORS)

export function getChatNavbarUiIdentityDescriptors() {
  return CHAT_NAVBAR_UI_DESCRIPTORS
}

export function getChatNavbarUiIdentities() {
  return CHAT_NAVBAR_UI_IDENTITIES
}

export function ChatNavbar({
  sidebarCollapsed,
  onOpenSidebar,
  onCollapseSidebar,
  onExpandSidebar,
  onForkSession,
  onMergeSession,
  localPath,
  currentSessionRuntime,
  currentRepoStatus,
  chatTitle,
  chatStatus,
  runtimeModel,
  runtimeProvider,
  socket,
  onOpenPtyChat,
}: Props) {
  const pathLabel = getPathLabel(localPath, currentRepoStatus)
  const compactRepoLabel = getCompactRepoLabel(pathLabel, currentRepoStatus)
  const contextPercent = currentSessionRuntime?.tokenUsage?.estimatedContextPercent
  const modelName = currentSessionRuntime?.model ?? runtimeModel ?? undefined
  const provider = modelName ? getProviderFromModel(modelName) : (runtimeProvider ?? null)
  const ProviderIcon = provider ? PROVIDER_ICONS[provider] : null

  return (
    <div
      {...getUiIdentityAttributeProps(CHAT_NAVBAR_UI_DESCRIPTORS.root)}
      className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/40 bg-background flex-shrink-0"
    >
      <div
        {...getUiIdentityAttributeProps(CHAT_NAVBAR_UI_DESCRIPTORS.area)}
        className="flex items-center gap-1.5 w-full min-w-0"
      >
        {/* Sidebar toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden size-7"
          onClick={onOpenSidebar}
          title="Open sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex size-7"
          onClick={sidebarCollapsed ? onExpandSidebar : onCollapseSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="size-4" />
        </Button>

        {/* Fork / Merge */}
        <Button
          {...getUiIdentityAttributeProps(CHAT_NAVBAR_UI_DESCRIPTORS.forkSessionAction)}
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onForkSession}
          title="Fork session"
        >
          <GitFork className="size-3.5" />
        </Button>
        <Button
          {...getUiIdentityAttributeProps(CHAT_NAVBAR_UI_DESCRIPTORS.mergeSessionAction)}
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onMergeSession}
          title="Merge sessions"
        >
          <Merge className="size-3.5" />
        </Button>

        {/* Provider icon */}
        {ProviderIcon && modelName ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center size-7 text-muted-foreground" data-testid="model-indicator">
                <ProviderIcon className="size-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              {modelName}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* PTY instances indicator */}
        <PtyInstancesIndicator socket={socket} onOpenChat={onOpenPtyChat} />

        {/* Separator */}
        {chatTitle ? <div className="w-px h-3.5 bg-border/60 shrink-0" /> : null}

        {/* Status dot + title */}
        {chatTitle ? (
          <div
            className="flex items-center gap-1.5 min-w-0 flex-1"
            data-testid="session-summary"
            data-status={chatStatus ?? "idle"}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", getStatusDotClass(chatStatus))} />
            <span
              className="truncate text-xs leading-none text-muted-foreground"
              title={chatTitle}
            >
              {chatTitle}
            </span>
          </div>
        ) : <div className="flex-1" />}

        {/* Repo label + context bar */}
        {compactRepoLabel ? (
          <RepoDetailPopover
            localPath={localPath}
            repoStatus={currentRepoStatus}
            compactLabel={compactRepoLabel}
          />
        ) : null}

        {contextPercent !== undefined ? (
          <ContextBar percent={contextPercent} testId="context-bar" />
        ) : null}
      </div>
    </div>
  )
}

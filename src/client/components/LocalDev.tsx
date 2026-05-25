import { useMemo, useState, type ReactNode } from "react"
import { formatRelativeTime } from "../lib/formatters"
import {
  BadgePlus,
  Check,
  CodeXml,
  Copy,
  FolderOpen,
  Loader2,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react"
import { APP_NAME, getCliInvocation, SDK_CLIENT_APP } from "../../shared/branding"
import type {
  IndependentWorkspace,
  LocalWorkspacesSnapshot,
  SidebarChatRow,
  SidebarWorkspaceGroup,
} from "../../shared/types"
import type { SocketStatus } from "../app/socket-interface"
import { PageHeader } from "../app/PageHeader"
import { getPathBasename } from "../lib/formatters"
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../lib/uiIdentityOverlay"
import { cn } from "../lib/utils"
import { HomepagePreferences } from "./HomepagePreferences"
import { NewProjectModal } from "./NewWorkspaceModal"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { SegmentedControl, type SegmentedOption } from "./ui/segmented-control"

export type HomeTab = "projects" | "workspaces" | "settings"

interface LocalDevProps {
  connectionStatus: SocketStatus
  ready: boolean
  snapshot: LocalWorkspacesSnapshot | null
  startingLocalPath: string | null
  commandError: string | null
  onOpenProject: (localPath: string) => Promise<void>
  onCreateProject: (project: { mode: "new" | "existing"; localPath: string; title: string }) => Promise<void>
  independentWorkspaces?: IndependentWorkspace[]
  onCreateWorkspace?: () => void
  onOpenWorkspace?: (workspaceId: string) => void
  onRenameWorkspace?: (workspaceId: string, name: string) => void
  onTogglePinWorkspace?: (workspaceId: string, pinned: boolean) => void
  onReorderWorkspaces?: (orderedWorkspaceIds: string[]) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  projectGroups?: SidebarWorkspaceGroup[]
  onOpenProjectPage?: (groupKey: string) => void
  activeTab?: HomeTab
  onActiveTabChange?: (tab: HomeTab) => void
  settingsPanel?: ReactNode
}

const LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS = {
  page: createC3UiIdentityDescriptor({
    id: "home.page",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  header: createC3UiIdentityDescriptor({
    id: "home.header",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  tabs: createC3UiIdentityDescriptor({
    id: "home.tabs",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  status: createC3UiIdentityDescriptor({
    id: "home.status",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  setup: createC3UiIdentityDescriptor({
    id: "home.setup",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  workspaceGrid: createC3UiIdentityDescriptor({
    id: "home.workspace-grid",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  addProjectAction: createC3UiIdentityDescriptor({
    id: "home.add-project.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectOverview: createC3UiIdentityDescriptor({
    id: "home.project-overview",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectCard: createC3UiIdentityDescriptor({
    id: "home.project-card",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectPrimaryAction: createC3UiIdentityDescriptor({
    id: "home.project-primary.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectSecondaryAction: createC3UiIdentityDescriptor({
    id: "home.project-secondary.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  newProjectDialog: createC3UiIdentityDescriptor({
    id: "home.add-project.dialog",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  settingsPanel: createC3UiIdentityDescriptor({
    id: "home.settings.panel",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  preferences: createC3UiIdentityDescriptor({
    id: "home.preferences",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
} as const
const LOCAL_PROJECTS_PAGE_UI_IDENTITIES = getUiIdentityIdMap(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS)
const HOME_TAB_OPTIONS: SegmentedOption<HomeTab>[] = [
  { value: "projects", label: "Projects", icon: FolderOpen },
  { value: "workspaces", label: "Workspaces", icon: CodeXml },
  { value: "settings", label: "Settings", icon: Settings },
]
const ACTIVE_SESSION_STATUSES = new Set(["starting", "running", "waiting_for_user", "awaiting_agents"])
const SESSION_STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  waiting_for_user: "Waiting",
  awaiting_agents: "Awaiting agents",
  failed: "Failed",
}

export function getLocalProjectsPageUiIdentities() {
  return LOCAL_PROJECTS_PAGE_UI_IDENTITIES
}

export function getLocalProjectsPageUiIdentityDescriptors() {
  return LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS
}

function getProjectTitle(project: LocalWorkspacesSnapshot["workspaces"][number]) {
  return project.title || getPathBasename(project.localPath)
}

function getProjectPrimaryLabel() {
  return "Open Project"
}

function getProjectSecondaryLabel() {
  return "Start First Task"
}

function getProjectOverviewSummary(
  project: LocalWorkspacesSnapshot["workspaces"][number],
) {
  const projectTitle = getProjectTitle(project)
  if (project.source === "saved") {
    return `${projectTitle} — pinned workspace.`
  }
  return `${projectTitle} — discovered from recent activity.`
}

export function getSortedHomepageProjects(snapshot: LocalWorkspacesSnapshot | null) {
  return [...(snapshot?.workspaces ?? [])].sort((left, right) => {
    const leftRank = left.lastOpenedAt ?? 0
    const rightRank = right.lastOpenedAt ?? 0

    if (leftRank !== rightRank) {
      return rightRank - leftRank
    }

    return left.title.localeCompare(right.title)
  })
}

function getSessionRank(chat: SidebarChatRow) {
  const activityRank = chat.lastMessageAt ?? chat._creationTime
  const statusRank = ACTIVE_SESSION_STATUSES.has(chat.status) ? 1_000_000_000 : 0

  return statusRank + activityRank
}

function getProjectPreviewSessions(projectGroup: SidebarWorkspaceGroup | null) {
  return [...(projectGroup?.chats ?? [])]
    .filter((chat) => ACTIVE_SESSION_STATUSES.has(chat.status))
    .sort((left, right) => getSessionRank(right) - getSessionRank(left))
    .slice(0, 2)
}

function getProjectLastActivity(projectGroup: SidebarWorkspaceGroup) {
  return Math.max(0, ...projectGroup.chats.map((chat) => chat.lastMessageAt ?? chat._creationTime))
}

function ProjectPageLink({
  href,
  disabled,
  onNavigate,
  onFallbackOpen,
  children,
  className,
}: {
  href: string | null
  disabled: boolean
  onNavigate?: () => void
  onFallbackOpen?: () => void
  children: ReactNode
  className?: string
}) {
  if (!href) {
    return (
      <Button
        size="sm"
        className={cn("flex-1", className)}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onFallbackOpen?.()
        }}
        {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectPrimaryAction)}
      >
        {children}
      </Button>
    )
  }

  return (
    <a
      href={href}
      aria-disabled={disabled}
      className={cn(
        "touch-manipulation inline-flex h-9 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground ring-offset-background transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled && "pointer-events-none bg-primary/50 text-primary-foreground/90",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation()
        if (disabled) {
          event.preventDefault()
          return
        }
        if (onNavigate) {
          event.preventDefault()
          onNavigate()
        }
      }}
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectPrimaryAction)}
    >
      {children}
    </a>
  )
}

function SessionPreviewList({ sessions }: { sessions: SidebarChatRow[] }) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground/70">
        <MessageSquare className="h-3 w-3" />
        Running sessions
      </div>
      {sessions.map((chat) => (
        <div
          key={chat.chatId}
          className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/70 bg-background/50 px-2 py-1.5 text-xs"
        >
          <span className="min-w-0 truncate text-foreground/85">{chat.title}</span>
          <span className="shrink-0 text-muted-foreground">
            {SESSION_STATUS_LABELS[chat.status] ?? chat.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={() => void handleCopy()}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center group bg-background border border-border text-foreground rounded-xl p-1.5 pl-3 font-mono text-sm">
      <pre className="overflow-x-auto">
        <code>{children}</code>
      </pre>
      <CopyButton text={children} />
    </div>
  )
}

function InfoCard({ children }: { children: ReactNode }) {
  return <div className="bg-card border border-border rounded-2xl p-4">{children}</div>
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
      {children}
    </h2>
  )
}

function ActionCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Sparkles
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <InfoCard>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-border bg-background p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </InfoCard>
  )
}

function ConnectionStatusCard({
  isConnecting,
  commandError,
}: {
  isConnecting: boolean
  commandError: string | null
}) {
  return (
    <InfoCard>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "rounded-xl border p-2",
            isConnecting
              ? "border-border bg-background"
              : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          )}>
            <Loader2 className={cn("h-4 w-4", isConnecting && "animate-spin text-muted-foreground")} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              {isConnecting ? `Connecting to your local ${APP_NAME} server` : `Local ${APP_NAME} server not reachable`}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isConnecting
                ? `Loading workspaces from this machine.`
                : `This browser tab can't reach the local ${APP_NAME} server yet. Start it on this machine and the page will reconnect automatically.`}
            </p>
          </div>
        </div>
        {commandError ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {commandError}
          </div>
        ) : null}
      </div>
    </InfoCard>
  )
}

function WorkspaceCard({
  workspace,
  onClick,
  index,
  onRename,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  workspace: IndependentWorkspace
  onClick: () => void
  index: number
  onRename?: (workspaceId: string, name: string) => void
  onTogglePin?: (workspaceId: string, pinned: boolean) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete?: (workspaceId: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(workspace.name)
  const hasMenu = Boolean(onRename || onTogglePin || onMoveUp || onMoveDown || onDelete)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== workspace.name) onRename?.(workspace.id, trimmed)
    setRenaming(false)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${index * 40}ms` }}
      className="animate-homepage-enter rounded-xl p-4 text-left transition-colors duration-200 bg-card ring-1 ring-border hover:ring-[color:var(--color-logo)]/15 group cursor-pointer"
      onClick={() => { if (!renaming) onClick() }}
      onKeyDown={(e) => { if (!renaming && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick() } }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Enter") { e.preventDefault(); commit() }
                else if (e.key === "Escape") { e.preventDefault(); setRenaming(false) }
              }}
              className="w-full bg-transparent font-medium text-foreground outline-none border-b border-border"
            />
          ) : (
            <div className="font-medium text-foreground truncate flex items-center gap-1.5">
              {workspace.pinned ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              <span className="truncate">{workspace.name}</span>
            </div>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            Created {formatRelativeTime(workspace.createdAt)}
          </div>
        </div>
        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Workspace actions"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {onRename ? (
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDraft(workspace.name); setRenaming(true) }}>
                  <Pencil className="h-4 w-4" />
                  <span className="text-xs font-medium">Rename</span>
                </DropdownMenuItem>
              ) : null}
              {onTogglePin ? (
                <DropdownMenuItem onSelect={() => onTogglePin(workspace.id, !workspace.pinned)}>
                  {workspace.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  <span className="text-xs font-medium">{workspace.pinned ? "Unpin" : "Pin"}</span>
                </DropdownMenuItem>
              ) : null}
              {onMoveUp ? (
                <DropdownMenuItem onSelect={() => onMoveUp()}>
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Move up</span>
                </DropdownMenuItem>
              ) : null}
              {onMoveDown ? (
                <DropdownMenuItem onSelect={() => onMoveDown()}>
                  <ArrowDown className="h-4 w-4" />
                  <span className="text-xs font-medium">Move down</span>
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem
                  onSelect={() => onDelete(workspace.id)}
                  className="text-destructive dark:text-red-400 hover:bg-destructive/10 focus:bg-destructive/10 dark:hover:bg-red-500/20 dark:focus:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Delete</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        )}
      </div>
    </div>
  )
}

function ProjectCard({
  projectTitle,
  localPath,
  chatCount,
  projectHref,
  previewSessions,
  loading,
  selected,
  onSelect,
  onOpenProjectPage,
  onStartTask,
  index,
}: {
  projectTitle: string
  localPath: string
  chatCount: number
  projectHref: string | null
  previewSessions: SidebarChatRow[]
  loading: boolean
  selected: boolean
  onSelect: () => void
  onOpenProjectPage?: () => void
  onStartTask: () => void
  index: number
}) {
  const secondaryLabel = getProjectSecondaryLabel()

  return (
    <div
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectCard)}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "group animate-homepage-enter rounded-xl p-4 text-left transition-colors duration-200 cursor-pointer",
        selected
          ? "bg-card ring-1 ring-[color:var(--color-logo)]/20"
          : "bg-card ring-1 ring-border hover:ring-[color:var(--color-logo)]/15",
        loading && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => { if (!loading) onSelect() }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground truncate">{projectTitle}</div>
          <div className="mt-0.5 text-xs text-muted-foreground truncate">{localPath}</div>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />
        ) : null}
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        {`${chatCount} ${chatCount === 1 ? "chat" : "chats"}`}
      </div>
      <SessionPreviewList sessions={previewSessions} />

      <div className={cn(
        "mt-3 flex gap-2 transition-opacity duration-150",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        <ProjectPageLink
          href={projectHref}
          disabled={loading}
          onNavigate={onOpenProjectPage}
          onFallbackOpen={onStartTask}
        >
          <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
          {getProjectPrimaryLabel()}
        </ProjectPageLink>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); onStartTask() }}
          {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectSecondaryAction)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {secondaryLabel}
        </Button>
      </div>
    </div>
  )
}

function ProjectOverviewPanel({
  project,
  projectHref,
  previewSessions,
  loading,
  onOpenProjectPage,
  onStartTask,
}: {
  project: LocalWorkspacesSnapshot["workspaces"][number]
  projectHref: string | null
  previewSessions: SidebarChatRow[]
  loading: boolean
  onOpenProjectPage?: () => void
  onStartTask: () => void
}) {
  const projectTitle = getProjectTitle(project)
  const secondaryLabel = getProjectSecondaryLabel()
  const summary = getProjectOverviewSummary(project)

  return (
    <div
      className="animate-homepage-enter overflow-hidden rounded-2xl bg-card ring-1 ring-logo/12"
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectOverview)}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <h3 className="text-lg font-semibold leading-tight text-foreground">{projectTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1">
            {project.chatCount} {project.chatCount === 1 ? "chat" : "chats"}
          </span>
        </div>
        <SessionPreviewList sessions={previewSessions} />

        <div className="flex flex-wrap gap-2 pt-1">
          <ProjectPageLink
            href={projectHref}
            disabled={loading}
            onNavigate={onOpenProjectPage}
            onFallbackOpen={onStartTask}
            className="min-w-[10rem]"
          >
            <ArrowRight className="mr-1.5 h-4 w-4" />
            {getProjectPrimaryLabel()}
          </ProjectPageLink>
          <Button
            variant="outline"
            className="flex-1 min-w-[10rem]"
            disabled={loading}
            onClick={() => {
              onStartTask()
            }}
            {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectSecondaryAction)}
          >
            <BadgePlus className="mr-1.5 h-4 w-4" />
            {secondaryLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function LocalDev({
  connectionStatus,
  ready,
  snapshot,
  startingLocalPath,
  commandError,
  onOpenProject,
  onCreateProject,
  independentWorkspaces,
  onCreateWorkspace,
  onOpenWorkspace,
  onRenameWorkspace,
  onTogglePinWorkspace,
  onReorderWorkspaces,
  onDeleteWorkspace,
  projectGroups,
  onOpenProjectPage,
  activeTab: controlledActiveTab,
  onActiveTabChange,
  settingsPanel,
}: LocalDevProps) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [localActiveTab, setLocalActiveTab] = useState<HomeTab>("projects")

  const projectGroupByPath = useMemo(() => {
    return new Map((projectGroups ?? []).map((group) => [group.localPath, group]))
  }, [projectGroups])
  const projects = useMemo(() => {
    const projectByPath = new Map(getSortedHomepageProjects(snapshot).map((project) => [project.localPath, project]))

    for (const group of projectGroups ?? []) {
      if (!projectByPath.has(group.localPath)) {
        projectByPath.set(group.localPath, {
          localPath: group.localPath,
          title: getPathBasename(group.localPath),
          source: "saved",
          chatCount: group.chats.length,
          lastOpenedAt: getProjectLastActivity(group),
        })
      }
    }

    return [...projectByPath.values()].sort((left, right) => {
      const leftHasProjectPage = projectGroupByPath.has(left.localPath) ? 1 : 0
      const rightHasProjectPage = projectGroupByPath.has(right.localPath) ? 1 : 0

      if (leftHasProjectPage !== rightHasProjectPage) {
        return rightHasProjectPage - leftHasProjectPage
      }

      const leftRank = left.lastOpenedAt ?? 0
      const rightRank = right.lastOpenedAt ?? 0

      if (leftRank !== rightRank) {
        return rightRank - leftRank
      }

      return left.title.localeCompare(right.title)
    })
  }, [projectGroupByPath, projectGroups, snapshot])
  const selectedProject = projects.find((project) => project.localPath === selectedProjectPath) ?? projects[0] ?? null
  const isConnecting = connectionStatus === "connecting" || (connectionStatus === "connected" && !ready)
  const isConnected = connectionStatus === "connected" && ready
  const activeTab = controlledActiveTab ?? localActiveTab

  function setActiveTab(nextTab: HomeTab) {
    if (onActiveTabChange) {
      onActiveTabChange(nextTab)
    } else {
      setLocalActiveTab(nextTab)
    }
  }

  return (
    <div
      className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto"
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.page)}
    >
      {!isConnected ? (
        <>
          <PageHeader
            narrow
            icon={CodeXml}
            uiId={LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.header}
            title={isConnecting ? `Connecting ${APP_NAME}` : `Connect ${APP_NAME}`}
            subtitle={isConnecting
              ? `${APP_NAME} is starting up and loading your local projects.`
              : `Run ${APP_NAME} on this machine to unlock local files, saved projects, and chat history.`}
          />
          <div className="max-w-2xl w-full mx-auto pb-12 px-6">
            <SectionHeader>Status</SectionHeader>
            <div className="mb-8" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.status)}>
              <ConnectionStatusCard isConnecting={isConnecting} commandError={commandError} />
            </div>

            {!isConnecting ? (
              <div className="mb-10" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.setup)}>
                <SectionHeader>Get Connected</SectionHeader>
                <div className="space-y-4">
                  <ActionCard
                    icon={Sparkles}
                    title={`Start ${APP_NAME} locally`}
                    description="Open a terminal on this machine and run the local server. This page reconnects automatically as soon as it comes online."
                    action={<CodeBlock>{getCliInvocation()}</CodeBlock>}
                  />
                  <ActionCard
                    icon={FolderOpen}
                    title="Already running?"
                    description="If you expected this page to be connected already, double-check that the server is running on this same machine and keep this tab open for a few seconds."
                    action={(
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Wait a moment after startup: project and session snapshots arrive after the socket connects.</li>
                          <li>Run the command in a terminal on this machine, not on a different host.</li>
                          <li>If you want to start in the current directory or skip opening a browser tab, use the variants below.</li>
                        </ul>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Start in the current directory</div>
                          <CodeBlock>{getCliInvocation("").trim()}</CodeBlock>
                        </div>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Start without opening the browser</div>
                          <CodeBlock>{getCliInvocation("--no-open")}</CodeBlock>
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="px-4 pt-3 pb-2 md:pt-4 md:pb-3" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.header)}>
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-muted-foreground" />
              <h1 className="truncate text-base font-semibold text-foreground md:text-lg">
                {snapshot?.machine.displayName ?? "Local Projects"}
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage projects, workspaces, sessions, and Tinkaria settings.
            </p>
          </div>

          <div className="px-4 mb-3" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.tabs)}>
            <SegmentedControl
              value={activeTab}
              onValueChange={setActiveTab}
              options={HOME_TAB_OPTIONS}
              size="sm"
              className="w-full md:w-auto"
              optionClassName="flex-1 md:flex-initial justify-center"
              alwaysShowLabels
            />
          </div>

          <div className="w-full px-4 pb-10">
            {activeTab === "workspaces" && ((independentWorkspaces?.length ?? 0) > 0 || onCreateWorkspace) ? (
              <div className="mb-6">
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <SectionHeader>Workspaces</SectionHeader>
                  {onCreateWorkspace ? (
                    <Button variant="outline" size="sm" onClick={onCreateWorkspace}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      New Workspace
                    </Button>
                  ) : null}
                </div>
                {independentWorkspaces && independentWorkspaces.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {independentWorkspaces.map((ws, index) => {
                      const moveTo = (to: number) => {
                        const ids = independentWorkspaces.map((w) => w.id)
                        ;[ids[index], ids[to]] = [ids[to], ids[index]]
                        onReorderWorkspaces?.(ids)
                      }
                      return (
                        <WorkspaceCard
                          key={ws.id}
                          workspace={ws}
                          index={index}
                          onClick={() => onOpenWorkspace?.(ws.id)}
                          onRename={onRenameWorkspace}
                          onTogglePin={onTogglePinWorkspace}
                          onMoveUp={index > 0 && onReorderWorkspaces ? () => moveTo(index - 1) : undefined}
                          onMoveDown={
                            index < independentWorkspaces.length - 1 && onReorderWorkspaces
                              ? () => moveTo(index + 1)
                              : undefined
                          }
                          onDelete={onDeleteWorkspace}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <InfoCard>
                    <p className="text-sm text-muted-foreground">
                      No workspaces yet. Create one to organize agents, repos, and workflows.
                    </p>
                  </InfoCard>
                )}
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <div
                className="space-y-4"
                {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.settingsPanel)}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <SectionHeader>Home settings</SectionHeader>
                </div>
                <InfoCard>
                  <HomepagePreferences />
                </InfoCard>
                {settingsPanel ?? null}
              </div>
            ) : null}

            {activeTab === "projects" ? (
              <>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <SectionHeader>Projects</SectionHeader>
              <Button
                variant="default"
                size="sm"
                onClick={() => setNewProjectOpen(true)}
                {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.addProjectAction)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Project
              </Button>
            </div>
            {projects.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.9fr)] lg:items-start">
                <div
                  className="grid grid-cols-1 gap-2 xl:grid-cols-2"
                  {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.workspaceGrid)}
                >
                  {(showAllProjects ? projects : projects.slice(0, 6)).map((project, index) => {
                    const projectTitle = getProjectTitle(project)
                    const projectGroup = projectGroupByPath.get(project.localPath) ?? null

                    return (
                      <ProjectCard
                        key={project.localPath}
                        index={index}
                        projectTitle={projectTitle}
                        localPath={project.localPath}
                        chatCount={project.chatCount}
                        projectHref={projectGroup ? `/project/${projectGroup.groupKey}` : null}
                        previewSessions={getProjectPreviewSessions(projectGroup)}
                        loading={startingLocalPath === project.localPath}
                        selected={selectedProject?.localPath === project.localPath}
                        onSelect={() => {
                          setSelectedProjectPath(project.localPath)
                        }}
                        onOpenProjectPage={projectGroup ? () => onOpenProjectPage?.(projectGroup.groupKey) : undefined}
                        onStartTask={() => {
                          void onOpenProject(project.localPath)
                        }}
                      />
                    )
                  })}
                </div>
                {projects.length > 6 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 justify-start text-xs text-muted-foreground hover:text-foreground lg:col-span-2"
                    onClick={() => setShowAllProjects(!showAllProjects)}
                  >
                    {showAllProjects ? "Show less" : `Show all ${projects.length} projects`}
                  </Button>
                ) : null}
                {selectedProject ? (
                  (() => {
                    const projectGroup = projectGroupByPath.get(selectedProject.localPath) ?? null

                    return (
                      <ProjectOverviewPanel
                        project={selectedProject}
                        projectHref={projectGroup ? `/project/${projectGroup.groupKey}` : null}
                        previewSessions={getProjectPreviewSessions(projectGroup)}
                        loading={startingLocalPath === selectedProject.localPath}
                        onOpenProjectPage={projectGroup ? () => onOpenProjectPage?.(projectGroup.groupKey) : undefined}
                        onStartTask={() => {
                          void onOpenProject(selectedProject.localPath)
                        }}
                      />
                    )
                  })()
                ) : null}
              </div>
            ) : (
              <InfoCard>
                <p className="text-sm text-muted-foreground">
                  No local projects yet. Add a workspace here or start {APP_NAME} inside a project directory to seed one automatically.
                </p>
              </InfoCard>
            )}
            {commandError ? (
              <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3 mt-4">
                {commandError}
              </div>
            ) : null}
              </>
            ) : null}
          </div>
        </>
      )}

      <NewProjectModal
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        rootUiId={LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.newProjectDialog}
        onConfirm={(project) => {
          void onCreateProject(project)
        }}
      />

      <div className="py-4 text-center">
        <span className="text-xs text-muted-foreground/50">v{SDK_CLIENT_APP.split("/")[1]}</span>
      </div>
    </div>
  )
}

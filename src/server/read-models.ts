import type {
  ChatRuntime,
  ChatSnapshot,
  SessionStatus,
  LocalWorkspacesSnapshot,
  ProviderCatalogEntry,
  RepoSummary,
  SidebarChatRow,
  SidebarData,
  SidebarWorkspaceGroup,
  TranscriptEntry,
  TranscriptRenderUnit,
} from "../shared/types"
import { compareIndependentWorkspaces } from "../shared/types"
import type { ChatRecord, StoreState, WorkspaceCoordinationState } from "./events"
import { createEmptyCoordinationState } from "./events"
import type { WorkspaceCoordinationSnapshot } from "../shared/workspace-types"
import type { AgentConfigSnapshot } from "../shared/agent-config-types"
import type { WorkflowRunsSnapshot } from "../shared/workflow-types"
import { resolveLocalPath } from "./paths"
import { SERVER_PROVIDERS } from "./provider-catalog"
import { foldTranscriptRenderUnits } from "../shared/transcript-render"

export const TRANSCRIPT_RENDER_WINDOW_SIZE = 200

export function isTranscriptRenderLoadingStatus(status: SessionStatus | undefined): boolean {
  return status === "starting" || status === "running" || status === "waiting_for_user" || status === "awaiting_agents"
}

export function deriveTranscriptRenderUnits(
  entries: TranscriptEntry[],
  status?: SessionStatus,
): TranscriptRenderUnit[] {
  return foldTranscriptRenderUnits(entries, { isLoading: isTranscriptRenderLoadingStatus(status) })
}

export function deriveStatus(
  chat: ChatRecord,
  activeStatus?: SessionStatus,
  hasActiveBlockingDelegations?: (chatId: string) => boolean,
): SessionStatus {
  if (activeStatus) return activeStatus
  if (chat.lastTurnOutcome === "failed") return "failed"
  if (hasActiveBlockingDelegations?.(chat.id)) return "awaiting_agents"
  return "idle"
}

export function deriveSidebarData(
  state: StoreState,
  activeStatuses: Map<string, SessionStatus>,
  hasActiveBlockingDelegations?: (chatId: string) => boolean,
): SidebarData {
  const projects = [...state.workspacesById.values()]
    .filter((project) => !project.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const workspaceGroups: SidebarWorkspaceGroup[] = projects.map((project) => {
    const chats: SidebarChatRow[] = [...state.chatsById.values()]
      .filter((chat) => chat.workspaceId === project.id && !chat.deletedAt)
      .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt))
      .map((chat) => ({
        _id: chat.id,
        _creationTime: chat.createdAt,
        chatId: chat.id,
        title: chat.title,
        status: deriveStatus(chat, activeStatuses.get(chat.id), hasActiveBlockingDelegations),
        unread: chat.unread,
        localPath: project.localPath,
        provider: chat.provider,
        model: chat.model ?? null,
        lastMessageAt: chat.lastMessageAt,
        hasAutomation: false,
      }))

    return {
      groupKey: project.id,
      localPath: project.localPath,
      chats,
    }
  })

  const independentWorkspaces = [...state.independentWorkspacesById.values()]
    .sort(compareIndependentWorkspaces)

  return { workspaceGroups, independentWorkspaces }
}

export function deriveLocalWorkspacesSnapshot(
  state: StoreState,
  discoveredProjects: Array<{ localPath: string; title: string; modifiedAt: number }>,
  machineName: string
): LocalWorkspacesSnapshot {
  const workspaces = new Map<string, LocalWorkspacesSnapshot["workspaces"][number]>()

  for (const project of discoveredProjects) {
    const normalizedPath = resolveLocalPath(project.localPath)
    workspaces.set(normalizedPath, {
      localPath: normalizedPath,
      title: project.title,
      source: "discovered",
      lastOpenedAt: project.modifiedAt,
      chatCount: 0,
    })
  }

  for (const project of [...state.workspacesById.values()].filter((entry) => !entry.deletedAt)) {
    const chats = [...state.chatsById.values()].filter((chat) => chat.workspaceId === project.id && !chat.deletedAt)
    const lastOpenedAt = chats.reduce(
      (latest, chat) => Math.max(latest, chat.lastMessageAt ?? chat.updatedAt ?? 0),
      project.updatedAt
    )

    workspaces.set(project.localPath, {
      localPath: project.localPath,
      title: project.title,
      source: "saved",
      lastOpenedAt,
      chatCount: chats.length,
    })
  }

  return {
    machine: {
      id: "local",
      displayName: machineName,
    },
    workspaces: [...workspaces.values()].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)),
  }
}

export function deriveChatSnapshot(
  state: StoreState,
  activeStatuses: Map<string, SessionStatus>,
  chatId: string,
  messageCount: number,
  availableSkills?: string[],
  hasActiveBlockingDelegations?: (chatId: string) => boolean,
  renderUnits: TranscriptRenderUnit[] = [],
  availableProviders: ProviderCatalogEntry[] = [...SERVER_PROVIDERS],
): ChatSnapshot | null {
  const chat = state.chatsById.get(chatId)
  if (!chat || chat.deletedAt) return null
  const project = state.workspacesById.get(chat.workspaceId)
  if (!project || project.deletedAt) return null

  const runtime: ChatRuntime = {
    chatId: chat.id,
    workspaceId: project.id,
    localPath: project.localPath,
    title: chat.title,
    status: deriveStatus(chat, activeStatuses.get(chat.id), hasActiveBlockingDelegations),
    provider: chat.provider,
    model: chat.model ?? null,
    planMode: chat.planMode,
    sessionToken: chat.sessionToken,
  }
  const queuedTurn = state.queuedTurnsByChat.get(chatId) ?? null

  return {
    runtime,
    messageCount,
    renderUnits,
    availableProviders,
    availableSkills: availableSkills ?? [],
    queuedTurn: queuedTurn ? { ...queuedTurn } : null,
  }
}

/** Derive a coordination snapshot from any state with coordinationByWorkspace. */
export function deriveCoordinationSnapshot(
  state: { coordinationByWorkspace: Map<string, WorkspaceCoordinationState> },
  workspaceId: string,
): WorkspaceCoordinationSnapshot {
  const coord = state.coordinationByWorkspace.get(workspaceId) ?? createEmptyCoordinationState()

  const todos = [...coord.todos.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const claims = [...coord.claims.values()]
    .filter((c) => c.status !== "released")

  const worktrees = [...coord.worktrees.values()]
    .filter((w) => w.status !== "removed")

  const rules = [...coord.rules.values()]

  return {
    workspaceId,
    todos,
    claims,
    worktrees,
    rules,
    lastUpdated: coord.lastUpdated,
  }
}

/** Convenience overload accepting full StoreState (used by nats-publisher). */
export function deriveWorkspaceCoordinationSnapshot(
  state: StoreState,
  workspaceId: string,
): WorkspaceCoordinationSnapshot {
  return deriveCoordinationSnapshot(state, workspaceId)
}

/** Derive repo list snapshot for a workspace. */
export function deriveRepoListSnapshot(state: StoreState, workspaceId: string): { workspaceId: string; repos: RepoSummary[] } {
  const repos: RepoSummary[] = []
  for (const repo of state.reposById.values()) {
    if (repo.workspaceId === workspaceId) {
      repos.push({
        id: repo.id,
        workspaceId: repo.workspaceId,
        label: repo.label,
        origin: repo.origin,
        localPath: repo.localPath,
        status: repo.status,
        branch: repo.branch,
      })
    }
  }
  return { workspaceId, repos }
}

/** Derive agent config snapshot for a workspace. */
export function deriveAgentConfigSnapshot(
  state: StoreState,
  workspaceId: string,
): AgentConfigSnapshot {
  const configMap = state.agentConfigsByWorkspace.get(workspaceId)
  const configs = configMap ? [...configMap.values()] : []
  const lastUpdated = configs.length > 0
    ? new Date(Math.max(...configs.map((c) => c.updatedAt))).toISOString()
    : new Date(0).toISOString()
  return { workspaceId, configs, lastUpdated }
}

/** Derive workflow runs snapshot for a workspace. */
export function deriveWorkflowRunsSnapshot(
  state: StoreState,
  workspaceId: string,
): WorkflowRunsSnapshot {
  const runsMap = state.workflowRunsByWorkspace.get(workspaceId) ?? new Map()
  const runs = [...runsMap.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 50)
  const activeRunIds = runs
    .filter((r) => r.status === "running")
    .map((r) => r.runId)
  return { workspaceId, runs, activeRunIds }
}

export function deriveSandboxSnapshot(
  state: StoreState,
  workspaceId: string,
): import("../shared/sandbox-types").SandboxSnapshot {
  const sandbox = state.sandboxByWorkspace.get(workspaceId) ?? null
  return { workspaceId, sandbox, health: null }
}

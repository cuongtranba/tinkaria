import type { AgentProvider, IndependentWorkspace, ModelOptions, WorkspaceSummary, TranscriptEntry } from "../shared/types"
import type { WorkspaceTodo, WorkspaceClaim, WorkspaceWorktree, WorkspaceRule } from "../shared/workspace-types"
import type { AgentConfig, AgentConfigRecord } from "../shared/agent-config-types"
import type { ProviderProfile, ProviderProfileRecord, WorkspaceProfileOverride } from "../shared/profile-types"
import type { ExtensionPreference } from "../shared/extension-types"
import type { WorkflowRunState } from "../shared/workflow-types"
import type { SandboxRecord, SandboxHealthReport, ResourceLimits } from "../shared/sandbox-types"

export interface WorkspaceRecord extends WorkspaceSummary {
  deletedAt?: number
}

export interface RepoRecord {
  id: string
  workspaceId: string
  origin: string | null
  localPath: string
  label: string | null
  status: "cloned" | "pending" | "error"
  branch: string | null
  createdAt: number
  updatedAt: number
}

export interface ChatRecord {
  id: string
  workspaceId: string
  repoId: string | null
  title: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
  unread: boolean
  provider: AgentProvider | null
  model?: string | null
  planMode: boolean
  sessionToken: string | null
  lastMessageAt?: number
  lastTurnOutcome: "success" | "failed" | "cancelled" | null
  /** PR5: sticky runner pin. Absent on pre-PR5 chats → treated as no pin. */
  runnerId?: string | null
}

export interface QueuedChatTurnRecord {
  chatId: string
  provider?: AgentProvider
  content: string
  model?: string
  modelOptions?: ModelOptions
  effort?: string
  planMode?: boolean
  updatedAt: number
}

export interface WorkspaceCoordinationState {
  todos: Map<string, WorkspaceTodo>
  claims: Map<string, WorkspaceClaim>
  worktrees: Map<string, WorkspaceWorktree>
  rules: Map<string, WorkspaceRule>
  lastUpdated: string
}

export interface StoreState {
  workspacesById: Map<string, WorkspaceRecord>
  workspaceIdsByPath: Map<string, string>
  independentWorkspacesById: Map<string, IndependentWorkspace>
  chatsById: Map<string, ChatRecord>
  queuedTurnsByChat: Map<string, QueuedChatTurnRecord>
  coordinationByWorkspace: Map<string, WorkspaceCoordinationState>
  agentConfigsByWorkspace: Map<string, Map<string, AgentConfigRecord>>
  reposById: Map<string, RepoRecord>
  reposByPath: Map<string, string>
  workflowRunsByWorkspace: Map<string, Map<string, WorkflowRunState>>
  sandboxByWorkspace: Map<string, SandboxRecord>
  providerProfiles: Map<string, ProviderProfileRecord>
  workspaceProfileOverrides: Map<string, Map<string, WorkspaceProfileOverride>>
  extensionPreferences: Map<string, ExtensionPreference>
}

export function createEmptyCoordinationState(): WorkspaceCoordinationState {
  return {
    todos: new Map(),
    claims: new Map(),
    worktrees: new Map(),
    rules: new Map(),
    lastUpdated: new Date(0).toISOString(),
  }
}

export interface SnapshotFile {
  v: 2 | 3
  generatedAt: number
  workspaces: WorkspaceRecord[]
  independentWorkspaces?: IndependentWorkspace[]
  chats: ChatRecord[]
  queuedTurns?: QueuedChatTurnRecord[]
  messages?: Array<{ chatId: string; entries: TranscriptEntry[] }>
  coordination?: Array<{ workspaceId: string; todos: WorkspaceTodo[]; claims: WorkspaceClaim[]; worktrees: WorkspaceWorktree[]; rules: WorkspaceRule[] }>
  agentConfigs?: Array<{ workspaceId: string; records: AgentConfigRecord[] }>
  repos?: RepoRecord[]
  workflowRuns?: Array<{ workspaceId: string; runs: WorkflowRunState[] }>
  sandboxes?: SandboxRecord[]
  providerProfiles?: ProviderProfileRecord[]
  workspaceProfileOverrides?: WorkspaceProfileOverride[]
  extensionPreferences?: ExtensionPreference[]
}

export type WorkspaceEvent = {
  v: 3
  type: "workspace_opened"
  timestamp: number
  workspaceId: string
  localPath: string
  title: string
} | {
  v: 3
  type: "workspace_removed"
  timestamp: number
  workspaceId: string
} | {
  v: 3
  type: "independent_workspace_created"
  timestamp: number
  workspaceId: string
  name: string
} | {
  v: 3
  type: "independent_workspace_deleted"
  timestamp: number
  workspaceId: string
} | {
  v: 3
  type: "independent_workspace_renamed"
  timestamp: number
  workspaceId: string
  name: string
} | {
  v: 3
  type: "independent_workspace_pin_toggled"
  timestamp: number
  workspaceId: string
  pinned: boolean
} | {
  v: 3
  type: "independent_workspaces_reordered"
  timestamp: number
  orderedWorkspaceIds: string[]
}

export type ChatEvent =
  | {
      v: 3
      type: "chat_created"
      timestamp: number
      chatId: string
      workspaceId: string
      title: string
      repoId?: string
    }
  | {
      v: 3
      type: "chat_renamed"
      timestamp: number
      chatId: string
      title: string
    }
  | {
      v: 3
      type: "chat_deleted"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "chat_provider_set"
      timestamp: number
      chatId: string
      provider: AgentProvider
    }
  | {
      v: 3
      type: "chat_model_set"
      timestamp: number
      chatId: string
      model: string | null
    }
  | {
      v: 3
      type: "chat_plan_mode_set"
      timestamp: number
      chatId: string
      planMode: boolean
    }
  | {
      v: 3
      type: "chat_read_state_set"
      timestamp: number
      chatId: string
      unread: boolean
    }
  | {
      v: 3
      type: "chat_runner_set"
      timestamp: number
      chatId: string
      runnerId: string | null
    }

export type MessageEvent = {
  v: 3
  type: "message_appended"
  timestamp: number
  chatId: string
  entry: TranscriptEntry
}

export type TurnEvent =
  | {
      v: 3
      type: "turn_started"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "turn_finished"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "turn_failed"
      timestamp: number
      chatId: string
      error: string
    }
  | {
      v: 3
      type: "turn_cancelled"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "session_token_set"
      timestamp: number
      chatId: string
      sessionToken: string | null
    }
  | {
      v: 3
      type: "chat_turn_queued"
      timestamp: number
      chatId: string
      provider?: AgentProvider
      content: string
      model?: string
      modelOptions?: ModelOptions
      effort?: string
      planMode?: boolean
    }
  | {
      v: 3
      type: "chat_queued_turn_cleared"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "delegation_initiated"
      timestamp: number
      delegationId: string
      parentChatId: string
      childChatId: string
      workspaceId: string
      mode: "blocking" | "background"
      resume: "immediate" | "gate"
    }
  | {
      v: 3
      type: "delegation_completed"
      timestamp: number
      delegationId: string
      parentChatId: string
      childChatId: string
      workspaceId: string
      outcome: "completed" | "failed" | "orphaned" | "stale"
    }

export type CoordinationEvent =
  | { v: 3; type: "todo_added"; timestamp: number; workspaceId: string; todoId: string; description: string; priority: "high" | "normal" | "low"; createdBy: string }
  | { v: 3; type: "todo_claimed"; timestamp: number; workspaceId: string; todoId: string; claimedBy: string }
  | { v: 3; type: "todo_completed"; timestamp: number; workspaceId: string; todoId: string; outputs: string[] }
  | { v: 3; type: "todo_abandoned"; timestamp: number; workspaceId: string; todoId: string }
  | { v: 3; type: "claim_created"; timestamp: number; workspaceId: string; claimId: string; intent: string; files: string[]; sessionId: string }
  | { v: 3; type: "claim_released"; timestamp: number; workspaceId: string; claimId: string }
  | { v: 3; type: "claim_conflict_detected"; timestamp: number; workspaceId: string; claimId: string; conflictsWith: string; overlappingFiles: string[] }
  | { v: 3; type: "worktree_created"; timestamp: number; workspaceId: string; worktreeId: string; branch: string; baseBranch: string; path: string }
  | { v: 3; type: "worktree_assigned"; timestamp: number; workspaceId: string; worktreeId: string; sessionId: string }
  | { v: 3; type: "worktree_removed"; timestamp: number; workspaceId: string; worktreeId: string }
  | { v: 3; type: "rule_set"; timestamp: number; workspaceId: string; ruleId: string; content: string; setBy: string }
  | { v: 3; type: "rule_removed"; timestamp: number; workspaceId: string; ruleId: string }

export type RepoEvent =
  | { v: 3; type: "repo_added"; timestamp: number; id: string; workspaceId: string; localPath: string; origin: string | null; label: string | null; branch: string | null }
  | { v: 3; type: "repo_clone_started"; timestamp: number; id: string; workspaceId: string; origin: string; targetPath: string; label: string | null }
  | { v: 3; type: "repo_cloned"; timestamp: number; id: string; localPath: string; branch: string | null }
  | { v: 3; type: "repo_clone_failed"; timestamp: number; id: string; error: string }
  | { v: 3; type: "repo_removed"; timestamp: number; id: string; workspaceId: string }
  | { v: 3; type: "repo_label_updated"; timestamp: number; id: string; label: string }

export type AgentConfigEvent =
  | { v: 3; type: "agent_config_saved"; timestamp: number; workspaceId: string; agentId: string; config: AgentConfig }
  | { v: 3; type: "agent_config_committed"; timestamp: number; workspaceId: string; agentId: string; commitHash: string }
  | { v: 3; type: "agent_config_removed"; timestamp: number; workspaceId: string; agentId: string }

export type WorkflowEvent =
  | { v: 3; type: "workflow_started"; timestamp: number; runId: string; workflowId: string; workspaceId: string; targetRepoIds: string[]; triggeredBy: string }
  | { v: 3; type: "workflow_step_started"; timestamp: number; runId: string; workspaceId: string; stepIndex: number; mcp_tool: string; repoId?: string }
  | { v: 3; type: "workflow_step_completed"; timestamp: number; runId: string; workspaceId: string; stepIndex: number; repoId?: string; output: string }
  | { v: 3; type: "workflow_step_failed"; timestamp: number; runId: string; workspaceId: string; stepIndex: number; repoId?: string; error: string }
  | { v: 3; type: "workflow_completed"; timestamp: number; runId: string; workspaceId: string }
  | { v: 3; type: "workflow_failed"; timestamp: number; runId: string; workspaceId: string; error: string; failedStep: number }
  | { v: 3; type: "workflow_cancelled"; timestamp: number; runId: string; workspaceId: string }

export type SandboxEvent =
  | { v: 3; type: "sandbox_created"; timestamp: number; id: string; workspaceId: string; resourceLimits: ResourceLimits }
  | { v: 3; type: "sandbox_started"; timestamp: number; id: string; containerId: string; natsUrl: string }
  | { v: 3; type: "sandbox_stopped"; timestamp: number; id: string; reason: string }
  | { v: 3; type: "sandbox_destroyed"; timestamp: number; id: string }
  | { v: 3; type: "sandbox_error"; timestamp: number; id: string; error: string }
  | { v: 3; type: "sandbox_health_updated"; timestamp: number; id: string; health: SandboxHealthReport }

export type ProviderProfileEvent =
  | { v: 3; type: "provider_profile_saved"; timestamp: number; profileId: string; profile: ProviderProfile }
  | { v: 3; type: "provider_profile_removed"; timestamp: number; profileId: string }
  | { v: 3; type: "workspace_profile_override_set"; timestamp: number; workspaceId: string; profileId: string; overrides: Partial<Omit<ProviderProfile, "id" | "provider">> }
  | { v: 3; type: "workspace_profile_override_removed"; timestamp: number; workspaceId: string; profileId: string }

export type ExtensionPreferenceEvent =
  | { v: 3; type: "extension_preference_set"; timestamp: number; extensionId: string; enabled: boolean }

export type StoreEvent = WorkspaceEvent | ChatEvent | MessageEvent | TurnEvent | CoordinationEvent | RepoEvent | AgentConfigEvent | WorkflowEvent | SandboxEvent | ProviderProfileEvent | ExtensionPreferenceEvent

export function createEmptyState(): StoreState {
  return {
    workspacesById: new Map(),
    workspaceIdsByPath: new Map(),
    independentWorkspacesById: new Map(),
    chatsById: new Map(),
    queuedTurnsByChat: new Map(),
    coordinationByWorkspace: new Map(),
    agentConfigsByWorkspace: new Map(),
    reposById: new Map(),
    reposByPath: new Map(),
    workflowRunsByWorkspace: new Map(),
    sandboxByWorkspace: new Map(),
    providerProfiles: new Map(),
    workspaceProfileOverrides: new Map(),
    extensionPreferences: new Map(),
  }
}

export function cloneTranscriptEntries(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.map((entry) => ({ ...entry }))
}

import type {
  AgentProvider,
  ModelOptions,
} from "./types"

export type SubscriptionTopic =
  | { type: "sidebar" }
  | { type: "local-workspaces" }
  | { type: "update" }
  | { type: "chat"; chatId: string }
  | { type: "terminal"; terminalId: string }
  | { type: "orchestration"; chatId: string }
  | { type: "workspace"; workspaceId: string }
  | { type: "agent-config"; workspaceId: string }
  | { type: "repos"; workspaceId: string }
  | { type: "workflow-runs"; workspaceId: string }
  | { type: "sandbox-status"; workspaceId: string }
  | { type: "runtime-status" }
  | { type: "profiles" }
  | { type: "extension-preferences" }

export interface TerminalSnapshot {
  terminalId: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  scrollback: number
  serializedState: string
  status: "running" | "exited"
  exitCode: number | null
  signal?: number
}

export type TerminalEvent =
  | { type: "terminal.output"; terminalId: string; data: string }
  | { type: "terminal.exit"; terminalId: string; exitCode: number; signal?: number }

export type ClientCommand =
  | { type: "project.open"; localPath: string }
  | { type: "project.create"; localPath: string; title: string }
  | { type: "project.remove"; workspaceId: string }
  | { type: "independent-workspace.create"; name: string }
  | { type: "independent-workspace.delete"; workspaceId: string }
  | { type: "independent-workspace.rename"; workspaceId: string; name: string }
  | { type: "independent-workspace.set-pinned"; workspaceId: string; pinned: boolean }
  | { type: "independent-workspace.reorder"; orderedWorkspaceIds: string[] }
  | { type: "system.ping" }
  | { type: "update.check"; force?: boolean }
  | { type: "update.install" }
  | {
      type: "system.openExternal"
      localPath: string
      action: "open_finder" | "open_terminal"
    }
  | {
      type: "system.readLocalFilePreview"
      localPath: string
    }
  | { type: "chat.create"; workspaceId: string; repoId?: string; chatId?: string }
  | { type: "chat.rename"; chatId: string; title: string }
  | { type: "chat.delete"; chatId: string }
  | { type: "chat.markRead"; chatId: string }
  | {
      type: "chat.send"
      chatId?: string
      workspaceId?: string
      provider?: AgentProvider
      content: string
      model?: string
      modelOptions?: ModelOptions
      effort?: string
      planMode?: boolean
    }
  | {
      type: "chat.queue"
      chatId: string
      provider?: AgentProvider
      content: string
      model?: string
      modelOptions?: ModelOptions
      effort?: string
      planMode?: boolean
    }
  | { type: "chat.cancel"; chatId: string }
  | { type: "chat.respondTool"; chatId: string; toolUseId: string; result: unknown }
  | { type: "chat.generateForkPrompt"; chatId: string; intent: string; preset?: string }
  | { type: "chat.generateMergePrompt"; chatIds: string[]; intent: string; preset?: string }
  | { type: "chat.getSessionRuntime"; chatId: string }
  | { type: "chat.getRepoStatus"; chatId: string }
  | { type: "chat.getMessageCount"; chatId: string }
  | { type: "chat.getRenderUnits"; chatId: string; offset?: number; limit?: number; isLoading?: boolean }
  | { type: "chat.getExternalSessionMessages"; parentChatId: string; sessionId: string }
  | { type: "terminal.create"; workspaceId: string; terminalId: string; cols: number; rows: number; scrollback: number }
  | { type: "terminal.input"; terminalId: string; data: string }
  | { type: "terminal.resize"; terminalId: string; cols: number; rows: number }
  | { type: "terminal.close"; terminalId: string }
  | { type: "chat.getMessages"; chatId: string; offset?: number; limit?: number }
  | { type: "snapshot.subscribe"; subscriptionId: string; topic: SubscriptionTopic }
  | { type: "snapshot.unsubscribe"; subscriptionId: string }
  | { type: "workspace.todo.add"; workspaceId: string; todoId: string; description: string; priority?: "high" | "normal" | "low"; createdBy?: string }
  | { type: "workspace.todo.claim"; workspaceId: string; todoId: string; sessionId: string }
  | { type: "workspace.todo.complete"; workspaceId: string; todoId: string; outputs: string[] }
  | { type: "workspace.todo.abandon"; workspaceId: string; todoId: string }
  | { type: "workspace.claim.create"; workspaceId: string; claimId: string; intent: string; files: string[]; sessionId: string }
  | { type: "workspace.claim.release"; workspaceId: string; claimId: string }
  | { type: "workspace.worktree.create"; workspaceId: string; worktreeId: string; branch: string; baseBranch?: string }
  | { type: "workspace.worktree.assign"; workspaceId: string; worktreeId: string; sessionId: string }
  | { type: "workspace.worktree.remove"; workspaceId: string; worktreeId: string }
  | { type: "workspace.rule.set"; workspaceId: string; ruleId: string; content: string; setBy: string }
  | { type: "workspace.rule.remove"; workspaceId: string; ruleId: string }
  | { type: "workspace.coordination.snapshot"; workspaceId: string }
  | { type: "workspace.agent.save"; workspaceId: string; config: import("./agent-config-types").AgentConfig }
  | { type: "workspace.agent.list"; workspaceId: string }
  | { type: "workspace.agent.get"; workspaceId: string; agentId: string }
  | { type: "workspace.agent.remove"; workspaceId: string; agentId: string }
  | { type: "workspace.repo.add"; workspaceId: string; localPath: string; label?: string }
  | { type: "workspace.repo.clone"; workspaceId: string; origin: string; targetPath: string; label?: string }
  | { type: "workspace.repo.remove"; workspaceId: string; repoId: string }
  | { type: "workspace.repo.label"; repoId: string; label: string }
  | { type: "workspace.repo.status"; repoId: string }
  | { type: "workspace.repo.pull"; repoId: string; branch?: string }
  | { type: "workspace.repo.push"; repoId: string; branch?: string }
  | { type: "workspace.workflow.run"; workspaceId: string; workflowId: string; triggeredBy?: string }
  | { type: "workspace.workflow.cancel"; workspaceId: string; runId: string }
  | { type: "workspace.workflow.list"; workspaceId: string }
  | { type: "workspace.sandbox.create"; workspaceId: string; resourceLimits?: import("./sandbox-types").ResourceLimits }
  | { type: "workspace.sandbox.start"; workspaceId: string }
  | { type: "workspace.sandbox.stop"; workspaceId: string; reason?: string }
  | { type: "workspace.sandbox.destroy"; workspaceId: string }
  | { type: "workspace.sandbox.logs"; workspaceId: string; tail?: number }
  | { type: "workspace.sandbox.status"; workspaceId: string }
  | { type: "runtime.list" }
  | { type: "runtime.detect"; provider: "claude" | "codex" }
  | { type: "runtime.install"; provider: "claude" | "codex"; version: string }
  | { type: "runtime.remove"; provider: "claude" | "codex"; version: string }
  | { type: "runtime.health"; provider: "claude" | "codex"; version?: string }
  | { type: "profile.list" }
  | { type: "profile.save"; profile: import("./profile-types").ProviderProfile }
  | { type: "profile.remove"; profileId: string }
  | { type: "profile.resolve"; workspaceId: string; profileId: string }
  | { type: "workspace.profile.override.set"; workspaceId: string; profileId: string; overrides: Partial<Omit<import("./profile-types").ProviderProfile, "id" | "provider">> }
  | { type: "workspace.profile.override.remove"; workspaceId: string; profileId: string }
  | { type: "extension.preference.set"; extensionId: string; enabled: boolean }
  | { type: "extension.preference.list" }

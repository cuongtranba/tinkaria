import { appendFile, mkdir, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { getDataDir, LOG_PREFIX } from "../shared/branding"
import type { AgentConfig, AgentConfigRecord } from "../shared/agent-config-types"
import type { ProviderProfile, WorkspaceProfileOverride } from "../shared/profile-types"
import type { TeamMember } from "../shared/runner-team-types"
import type { AgentProvider, TranscriptEntry } from "../shared/types"
import { STORE_VERSION, compareIndependentWorkspaces } from "../shared/types"
import {
  type ChatEvent,
  type AgentConfigEvent,
  type CoordinationEvent,
  type MessageEvent,
  type WorkspaceEvent,
  type ProviderProfileEvent,
  type ExtensionPreferenceEvent,
  type RunnerTeamEvent,
  type SandboxEvent,
  type WorkflowEvent,
  type SnapshotFile,
  type StoreEvent,
  type StoreState,
  type RepoEvent,
  type RepoRecord,
  type TurnEvent,
  type QueuedChatTurnRecord,
  cloneTranscriptEntries,
  createEmptyCoordinationState,
  createEmptyState,
} from "./events"
import type { WorkflowRunState } from "../shared/workflow-types"
import type { SandboxRecord } from "../shared/sandbox-types"
import { resolveLocalPath } from "./paths"

const COMPACTION_THRESHOLD_BYTES = 2 * 1024 * 1024

interface LegacyTranscriptStats {
  hasLegacyData: boolean
  sources: Array<"snapshot" | "messages_log">
  chatCount: number
  entryCount: number
}

export class EventStore {
  readonly dataDir: string
  readonly state: StoreState = createEmptyState()
  private writeChain = Promise.resolve()
  private storageReset = false
  private readonly snapshotPath: string
  private readonly projectsLogPath: string
  private readonly chatsLogPath: string
  private readonly messagesLogPath: string
  private readonly turnsLogPath: string
  private readonly transcriptsDir: string
  private legacyMessagesByChatId = new Map<string, TranscriptEntry[]>()
  private snapshotHasLegacyMessages = false
  private transcriptCache = new Map<string, TranscriptEntry[]>()
  private static readonly TRANSCRIPT_CACHE_MAX = 5
  private readonly coordinationLogPath: string
  private readonly agentConfigsLogPath: string
  private readonly reposLogPath: string
  private readonly workflowsLogPath: string
  private readonly sandboxLogPath: string
  private readonly profilesLogPath: string
  private readonly extensionPrefsLogPath: string
  private readonly runnerTeamsLogPath: string
  private readonly ptySubagentLogPath: string
  private readonly ptyToolRequestsLogPath: string
  private readonly ptySessionTokensLogPath: string
  private readonly _ptySessionTokensByChatId = new Map<string, Map<string, string>>()

  constructor(dataDir = getDataDir(homedir())) {
    this.dataDir = dataDir
    this.snapshotPath = path.join(this.dataDir, "snapshot.json")
    this.projectsLogPath = path.join(this.dataDir, "projects.jsonl")
    this.chatsLogPath = path.join(this.dataDir, "chats.jsonl")
    this.messagesLogPath = path.join(this.dataDir, "messages.jsonl")
    this.turnsLogPath = path.join(this.dataDir, "turns.jsonl")
    this.transcriptsDir = path.join(this.dataDir, "transcripts")
    this.coordinationLogPath = path.join(this.dataDir, "coordination.jsonl")
    this.agentConfigsLogPath = path.join(this.dataDir, "agent-configs.jsonl")
    this.reposLogPath = path.join(this.dataDir, "repos.jsonl")
    this.workflowsLogPath = path.join(this.dataDir, "workflows.jsonl")
    this.sandboxLogPath = path.join(this.dataDir, "sandbox.jsonl")
    this.profilesLogPath = path.join(this.dataDir, "profiles.jsonl")
    this.extensionPrefsLogPath = path.join(this.dataDir, "extension-prefs.jsonl")
    this.runnerTeamsLogPath = path.join(this.dataDir, "runner-teams.jsonl")
    this.ptySubagentLogPath = path.join(this.dataDir, "pty-subagent.jsonl")
    this.ptyToolRequestsLogPath = path.join(this.dataDir, "pty-tool-requests.jsonl")
    this.ptySessionTokensLogPath = path.join(this.dataDir, "pty-session-tokens.jsonl")
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true })
    await mkdir(this.transcriptsDir, { recursive: true })
    await this.ensureFile(this.projectsLogPath)
    await this.ensureFile(this.chatsLogPath)
    await this.ensureFile(this.messagesLogPath)
    await this.ensureFile(this.turnsLogPath)
    await this.ensureFile(this.coordinationLogPath)
    await this.ensureFile(this.agentConfigsLogPath)
    await this.ensureFile(this.reposLogPath)
    await this.ensureFile(this.workflowsLogPath)
    await this.ensureFile(this.sandboxLogPath)
    await this.ensureFile(this.profilesLogPath)
    await this.ensureFile(this.extensionPrefsLogPath)
    await this.ensureFile(this.runnerTeamsLogPath)
    await this.ensureFile(this.ptySubagentLogPath)
    await this.ensureFile(this.ptyToolRequestsLogPath)
    await this.ensureFile(this.ptySessionTokensLogPath)
    await this.replayPtyLogs()
    await this.loadSnapshot()
    await this.replayLogs()
    if (!(await this.hasLegacyTranscriptData()) && await this.shouldCompact()) {
      await this.compact()
    }
  }

  private async ensureFile(filePath: string) {
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      await Bun.write(filePath, "")
    }
  }

  private async clearStorage() {
    if (this.storageReset) return
    this.storageReset = true
    this.resetState()
    this.clearLegacyTranscriptState()
    await Promise.all([
      Bun.write(this.snapshotPath, ""),
      Bun.write(this.projectsLogPath, ""),
      Bun.write(this.chatsLogPath, ""),
      Bun.write(this.messagesLogPath, ""),
      Bun.write(this.turnsLogPath, ""),
      Bun.write(this.coordinationLogPath, ""),
      Bun.write(this.agentConfigsLogPath, ""),
      Bun.write(this.reposLogPath, ""),
      Bun.write(this.workflowsLogPath, ""),
      Bun.write(this.sandboxLogPath, ""),
      Bun.write(this.profilesLogPath, ""),
      Bun.write(this.extensionPrefsLogPath, ""),
      Bun.write(this.runnerTeamsLogPath, ""),
    ])
  }

  private async loadSnapshot() {
    const file = Bun.file(this.snapshotPath)
    if (!(await file.exists())) return

    try {
      const text = await file.text()
      if (!text.trim()) return
      const parsed = JSON.parse(text) as SnapshotFile
      if (parsed.v !== STORE_VERSION) {
        console.warn(`${LOG_PREFIX} Resetting local chat history for store version ${STORE_VERSION}`)
        await this.clearStorage()
        return
      }
      for (const project of parsed.workspaces) {
        this.state.workspacesById.set(project.id, { ...project })
        this.state.workspaceIdsByPath.set(project.localPath, project.id)
      }
      if (parsed.independentWorkspaces?.length) {
        for (const ws of parsed.independentWorkspaces) {
          this.state.independentWorkspacesById.set(ws.id, { ...ws })
        }
      }
      for (const chat of parsed.chats) {
        this.state.chatsById.set(chat.id, { ...chat, unread: chat.unread ?? false, model: chat.model ?? null })
      }
      if (parsed.queuedTurns?.length) {
        for (const queued of parsed.queuedTurns) {
          this.state.queuedTurnsByChat.set(queued.chatId, { ...queued })
        }
      }
      if (parsed.coordination?.length) {
        for (const entry of parsed.coordination) {
          const coord = createEmptyCoordinationState()
          for (const todo of entry.todos) coord.todos.set(todo.id, todo)
          for (const claim of entry.claims) coord.claims.set(claim.id, claim)
          for (const wt of entry.worktrees) coord.worktrees.set(wt.id, wt)
          for (const rule of entry.rules) coord.rules.set(rule.id, rule)
          this.state.coordinationByWorkspace.set(entry.workspaceId, coord)
        }
      }
      if (parsed.agentConfigs?.length) {
        for (const entry of parsed.agentConfigs) {
          const configMap = new Map<string, AgentConfigRecord>()
          for (const record of entry.records) configMap.set(record.id, record)
          this.state.agentConfigsByWorkspace.set(entry.workspaceId, configMap)
        }
      }
      if (parsed.repos?.length) {
        for (const repo of parsed.repos) {
          this.state.reposById.set(repo.id, { ...repo })
          if (repo.localPath) this.state.reposByPath.set(repo.localPath, repo.id)
        }
      }
      if (parsed.workflowRuns?.length) {
        for (const entry of parsed.workflowRuns) {
          const runsMap = new Map<string, import("../shared/workflow-types").WorkflowRunState>()
          for (const run of entry.runs) runsMap.set(run.runId, run)
          this.state.workflowRunsByWorkspace.set(entry.workspaceId, runsMap)
        }
      }
      if (parsed.sandboxes?.length) {
        for (const sandbox of parsed.sandboxes) {
          this.state.sandboxByWorkspace.set(sandbox.workspaceId, sandbox)
        }
      }
      if (parsed.providerProfiles?.length) {
        for (const record of parsed.providerProfiles) {
          this.state.providerProfiles.set(record.id, { ...record })
        }
      }
      if (parsed.workspaceProfileOverrides?.length) {
        for (const override of parsed.workspaceProfileOverrides) {
          const wsMap = this.state.workspaceProfileOverrides.get(override.workspaceId) ?? new Map<string, WorkspaceProfileOverride>()
          wsMap.set(override.profileId, { ...override })
          this.state.workspaceProfileOverrides.set(override.workspaceId, wsMap)
        }
      }
      if (parsed.extensionPreferences?.length) {
        for (const pref of parsed.extensionPreferences) {
          this.state.extensionPreferences.set(pref.extensionId, { ...pref })
        }
      }
      if (parsed.teamMembers?.length) {
        for (const member of parsed.teamMembers) {
          this.state.teamMembers.set(member.id, { ...member })
        }
      }
      if (parsed.runnerLabels?.length) {
        for (const label of parsed.runnerLabels) {
          this.state.runnerLabels.set(label.runnerId, { ...label })
        }
      }
      if (parsed.messages?.length) {
        this.snapshotHasLegacyMessages = true
        for (const messageSet of parsed.messages) {
          this.legacyMessagesByChatId.set(messageSet.chatId, cloneTranscriptEntries(messageSet.entries))
        }
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to load snapshot, resetting local history:`, error)
      await this.clearStorage()
    }
  }

  private resetState() {
    this.state.workspacesById.clear()
    this.state.workspaceIdsByPath.clear()
    this.state.chatsById.clear()
    this.state.queuedTurnsByChat.clear()
    this.state.coordinationByWorkspace.clear()
    this.state.agentConfigsByWorkspace.clear()
    this.state.reposById.clear()
    this.state.reposByPath.clear()
    this.state.workflowRunsByWorkspace.clear()
    this.state.sandboxByWorkspace.clear()
    this.state.providerProfiles.clear()
    this.state.workspaceProfileOverrides.clear()
    this.state.extensionPreferences.clear()
    this.state.teamMembers.clear()
    this.state.runnerLabels.clear()
    this.transcriptCache.clear()
  }

  private clearLegacyTranscriptState() {
    this.legacyMessagesByChatId.clear()
    this.snapshotHasLegacyMessages = false
  }

  private async replayLogs() {
    if (this.storageReset) return
    await this.replayLog<WorkspaceEvent>(this.projectsLogPath)
    if (this.storageReset) return
    await this.replayLog<ChatEvent>(this.chatsLogPath)
    if (this.storageReset) return
    await this.replayLog<MessageEvent>(this.messagesLogPath)
    if (this.storageReset) return
    await this.replayLog<TurnEvent>(this.turnsLogPath)
    if (this.storageReset) return
    await this.replayLog<CoordinationEvent>(this.coordinationLogPath)
    if (this.storageReset) return
    await this.replayLog<AgentConfigEvent>(this.agentConfigsLogPath)
    if (this.storageReset) return
    await this.replayLog<RepoEvent>(this.reposLogPath)
    if (this.storageReset) return
    await this.replayLog<WorkflowEvent>(this.workflowsLogPath)
    if (this.storageReset) return
    await this.replayLog<SandboxEvent>(this.sandboxLogPath)
    if (this.storageReset) return
    await this.replayLog<ProviderProfileEvent>(this.profilesLogPath)
    if (this.storageReset) return
    await this.replayLog<ExtensionPreferenceEvent>(this.extensionPrefsLogPath)
    if (this.storageReset) return
    await this.replayLog<RunnerTeamEvent>(this.runnerTeamsLogPath)
  }

  private async replayLog<TEvent extends StoreEvent>(filePath: string) {
    const file = Bun.file(filePath)
    if (!(await file.exists())) return
    const text = await file.text()
    if (!text.trim()) return

    const lines = text.split("\n")
    let lastNonEmpty = -1
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].trim()) {
        lastNonEmpty = index
        break
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (!line) continue
      try {
        const event = JSON.parse(line) as Partial<StoreEvent>
        if (event.v !== STORE_VERSION) {
          console.warn(`${LOG_PREFIX} Resetting local history from incompatible event log`)
          await this.clearStorage()
          return
        }
        this.applyEvent(event as StoreEvent)
      } catch (error) {
        if (index === lastNonEmpty) {
          console.warn(`${LOG_PREFIX} Ignoring corrupt trailing line in ${path.basename(filePath)}`)
          return
        }
        console.warn(`${LOG_PREFIX} Failed to replay ${path.basename(filePath)}, resetting local history:`, error)
        await this.clearStorage()
        return
      }
    }
  }

  private applyEvent(event: StoreEvent) {
    switch (event.type) {
      case "workspace_opened": {
        const localPath = resolveLocalPath(event.localPath)
        const project = {
          id: event.workspaceId,
          localPath,
          title: event.title,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        }
        this.state.workspacesById.set(project.id, project)
        this.state.workspaceIdsByPath.set(localPath, project.id)
        break
      }
      case "workspace_removed": {
        const project = this.state.workspacesById.get(event.workspaceId)
        if (!project) break
        project.deletedAt = event.timestamp
        project.updatedAt = event.timestamp
        this.state.workspaceIdsByPath.delete(project.localPath)
        break
      }
      case "independent_workspace_created": {
        this.state.independentWorkspacesById.set(event.workspaceId, {
          id: event.workspaceId,
          name: event.name,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        })
        break
      }
      case "independent_workspace_deleted": {
        this.state.independentWorkspacesById.delete(event.workspaceId)
        break
      }
      case "independent_workspace_renamed": {
        const ws = this.state.independentWorkspacesById.get(event.workspaceId)
        if (ws) {
          ws.name = event.name
          ws.updatedAt = event.timestamp
        }
        break
      }
      case "independent_workspace_pin_toggled": {
        const ws = this.state.independentWorkspacesById.get(event.workspaceId)
        if (ws) {
          ws.pinned = event.pinned
          ws.updatedAt = event.timestamp
        }
        break
      }
      case "independent_workspaces_reordered": {
        event.orderedWorkspaceIds.forEach((id, index) => {
          const ws = this.state.independentWorkspacesById.get(id)
          if (ws) {
            ws.sortOrder = index
            ws.updatedAt = event.timestamp
          }
        })
        break
      }
      case "chat_created": {
        const chat = {
          id: event.chatId,
          workspaceId: event.workspaceId,
          repoId: event.repoId ?? null,
          title: event.title,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          unread: false,
          provider: null,
          model: null,
          planMode: false,
          sessionToken: null,
          lastTurnOutcome: null,
        }
        this.state.chatsById.set(chat.id, chat)
        break
      }
      case "chat_renamed": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.title = event.title
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_deleted": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.deletedAt = event.timestamp
        chat.updatedAt = event.timestamp
        this.state.queuedTurnsByChat.delete(event.chatId)
        break
      }
      case "chat_provider_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.provider = event.provider
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_model_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.model = event.model
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_plan_mode_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.planMode = event.planMode
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_read_state_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.unread = event.unread
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_runner_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.runnerId = event.runnerId
        chat.updatedAt = event.timestamp
        break
      }
      case "message_appended": {
        this.applyMessageMetadata(event.chatId, event.entry)
        const existing = this.legacyMessagesByChatId.get(event.chatId) ?? []
        existing.push({ ...event.entry })
        this.legacyMessagesByChatId.set(event.chatId, existing)
        break
      }
      case "turn_started": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        break
      }
      case "turn_finished": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "success"
        chat.unread = true
        break
      }
      case "turn_failed": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "failed"
        chat.unread = true
        break
      }
      case "turn_cancelled": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "cancelled"
        break
      }
      case "session_token_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.sessionToken = event.sessionToken
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_turn_queued": {
        const existing = this.state.queuedTurnsByChat.get(event.chatId)
        const current = existing?.content.trim() ?? ""
        const next = event.content.trim()
        const content = current && next ? `${current}\n\n${next}` : next || current
        if (!content) break
        this.state.queuedTurnsByChat.set(event.chatId, {
          chatId: event.chatId,
          provider: event.provider ?? existing?.provider,
          content,
          model: event.model ?? existing?.model,
          modelOptions: event.modelOptions ?? existing?.modelOptions,
          effort: event.effort ?? existing?.effort,
          planMode: event.planMode ?? existing?.planMode,
          updatedAt: event.timestamp,
        })
        break
      }
      case "chat_queued_turn_cleared": {
        this.state.queuedTurnsByChat.delete(event.chatId)
        break
      }
      case "todo_added": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.todos.set(event.todoId, {
          id: event.todoId,
          description: event.description,
          priority: event.priority,
          status: "open",
          claimedBy: null,
          outputs: [],
          createdBy: event.createdBy,
          createdAt: new Date(event.timestamp).toISOString(),
          updatedAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "todo_claimed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const todo = coord.todos.get(event.todoId)
        if (!todo) break
        todo.status = "claimed"
        todo.claimedBy = event.claimedBy
        todo.updatedAt = new Date(event.timestamp).toISOString()
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "todo_completed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const todo = coord.todos.get(event.todoId)
        if (!todo) break
        todo.status = "complete"
        todo.outputs = event.outputs
        todo.updatedAt = new Date(event.timestamp).toISOString()
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "todo_abandoned": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const todo = coord.todos.get(event.todoId)
        if (!todo) break
        todo.status = "abandoned"
        todo.updatedAt = new Date(event.timestamp).toISOString()
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "claim_created": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.claims.set(event.claimId, {
          id: event.claimId,
          intent: event.intent,
          files: event.files,
          sessionId: event.sessionId,
          status: "active",
          conflictsWith: null,
          createdAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "claim_released": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const claim = coord.claims.get(event.claimId)
        if (!claim) break
        claim.status = "released"
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "claim_conflict_detected": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const claim = coord.claims.get(event.claimId)
        if (!claim) break
        claim.status = "conflict"
        claim.conflictsWith = event.conflictsWith
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "worktree_created": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.worktrees.set(event.worktreeId, {
          id: event.worktreeId,
          branch: event.branch,
          baseBranch: event.baseBranch,
          path: event.path,
          assignedTo: null,
          status: "ready",
          createdAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "worktree_assigned": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const wt = coord.worktrees.get(event.worktreeId)
        if (!wt) break
        wt.assignedTo = event.sessionId
        wt.status = "assigned"
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "worktree_removed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const wt = coord.worktrees.get(event.worktreeId)
        if (!wt) break
        wt.status = "removed"
        wt.assignedTo = null
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "rule_set": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.rules.set(event.ruleId, {
          id: event.ruleId,
          content: event.content,
          setBy: event.setBy,
          updatedAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "rule_removed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.rules.delete(event.ruleId)
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "agent_config_saved": {
        const workspaceMap = this.state.agentConfigsByWorkspace.get(event.workspaceId) ?? new Map<string, AgentConfigRecord>()
        const existing = workspaceMap.get(event.agentId)
        workspaceMap.set(event.agentId, {
          id: event.agentId,
          workspaceId: event.workspaceId,
          config: event.config,
          createdAt: existing?.createdAt ?? event.timestamp,
          updatedAt: event.timestamp,
          lastCommitHash: existing?.lastCommitHash,
        })
        this.state.agentConfigsByWorkspace.set(event.workspaceId, workspaceMap)
        break
      }
      case "agent_config_committed": {
        const record = this.state.agentConfigsByWorkspace.get(event.workspaceId)?.get(event.agentId)
        if (record) record.lastCommitHash = event.commitHash
        break
      }
      case "agent_config_removed": {
        this.state.agentConfigsByWorkspace.get(event.workspaceId)?.delete(event.agentId)
        break
      }
      case "repo_added": {
        const repo: RepoRecord = {
          id: event.id,
          workspaceId: event.workspaceId,
          origin: event.origin,
          localPath: event.localPath,
          label: event.label,
          status: "cloned",
          branch: event.branch,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        }
        this.state.reposById.set(event.id, repo)
        if (event.localPath) this.state.reposByPath.set(event.localPath, event.id)
        break
      }
      case "repo_clone_started": {
        const repo: RepoRecord = {
          id: event.id,
          workspaceId: event.workspaceId,
          origin: event.origin,
          localPath: event.targetPath,
          label: event.label,
          status: "pending",
          branch: null,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        }
        this.state.reposById.set(event.id, repo)
        this.state.reposByPath.set(event.targetPath, event.id)
        break
      }
      case "repo_cloned": {
        const repo = this.state.reposById.get(event.id)
        if (!repo) break
        repo.status = "cloned"
        repo.localPath = event.localPath
        repo.branch = event.branch
        repo.updatedAt = event.timestamp
        this.state.reposByPath.set(event.localPath, event.id)
        break
      }
      case "repo_clone_failed": {
        const repo = this.state.reposById.get(event.id)
        if (!repo) break
        repo.status = "error"
        repo.updatedAt = event.timestamp
        break
      }
      case "repo_removed": {
        const repo = this.state.reposById.get(event.id)
        if (repo) {
          this.state.reposByPath.delete(repo.localPath)
          this.state.reposById.delete(event.id)
          // Re-parent orphaned chats
          for (const chat of this.state.chatsById.values()) {
            if (chat.repoId === event.id) {
              chat.repoId = null
            }
          }
        }
        break
      }
      case "repo_label_updated": {
        const repo = this.state.reposById.get(event.id)
        if (!repo) break
        repo.label = event.label
        repo.updatedAt = event.timestamp
        break
      }
      case "workflow_started": {
        const runsMap = this.state.workflowRunsByWorkspace.get(event.workspaceId) ?? new Map<string, WorkflowRunState>()
        runsMap.set(event.runId, {
          runId: event.runId,
          workflowId: event.workflowId,
          workspaceId: event.workspaceId,
          targetRepoIds: event.targetRepoIds,
          status: "running",
          steps: [],
          startedAt: event.timestamp,
          triggeredBy: event.triggeredBy,
        })
        this.state.workflowRunsByWorkspace.set(event.workspaceId, runsMap)
        break
      }
      case "workflow_step_started": {
        const run = this.state.workflowRunsByWorkspace.get(event.workspaceId)?.get(event.runId)
        if (!run) break
        run.steps.push({
          stepIndex: event.stepIndex,
          mcp_tool: event.mcp_tool,
          repoId: event.repoId,
          status: "running",
          startedAt: event.timestamp,
        })
        break
      }
      case "workflow_step_completed": {
        const run = this.state.workflowRunsByWorkspace.get(event.workspaceId)?.get(event.runId)
        if (!run) break
        const step = run.steps.find((s) => s.stepIndex === event.stepIndex && s.repoId === event.repoId)
        if (step) {
          step.status = "completed"
          step.output = event.output
          step.completedAt = event.timestamp
        }
        break
      }
      case "workflow_step_failed": {
        const run = this.state.workflowRunsByWorkspace.get(event.workspaceId)?.get(event.runId)
        if (!run) break
        const step = run.steps.find((s) => s.stepIndex === event.stepIndex && s.repoId === event.repoId)
        if (step) {
          step.status = "failed"
          step.error = event.error
          step.completedAt = event.timestamp
        }
        break
      }
      case "workflow_completed": {
        const run = this.state.workflowRunsByWorkspace.get(event.workspaceId)?.get(event.runId)
        if (!run) break
        run.status = "completed"
        run.completedAt = event.timestamp
        break
      }
      case "workflow_failed": {
        const run = this.state.workflowRunsByWorkspace.get(event.workspaceId)?.get(event.runId)
        if (!run) break
        run.status = "failed"
        run.error = event.error
        run.failedStep = event.failedStep
        run.completedAt = event.timestamp
        break
      }
      case "workflow_cancelled": {
        const run = this.state.workflowRunsByWorkspace.get(event.workspaceId)?.get(event.runId)
        if (!run) break
        run.status = "cancelled"
        run.completedAt = event.timestamp
        break
      }
      case "sandbox_created": {
        const record: SandboxRecord = {
          id: event.id,
          workspaceId: event.workspaceId,
          containerId: null,
          status: "creating",
          resourceLimits: event.resourceLimits,
          natsUrl: "",
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          lastHealthCheck: null,
          error: null,
        }
        this.state.sandboxByWorkspace.set(event.workspaceId, record)
        break
      }
      case "sandbox_started": {
        const existing = this.findSandboxById(event.id)
        if (existing) {
          existing.containerId = event.containerId
          existing.natsUrl = event.natsUrl
          existing.status = "running"
          existing.updatedAt = event.timestamp
        }
        break
      }
      case "sandbox_stopped": {
        const existing = this.findSandboxById(event.id)
        if (existing) {
          existing.status = "stopped"
          existing.updatedAt = event.timestamp
        }
        break
      }
      case "sandbox_destroyed": {
        for (const [key, sb] of this.state.sandboxByWorkspace) {
          if (sb.id === event.id) { this.state.sandboxByWorkspace.delete(key); break }
        }
        break
      }
      case "sandbox_error": {
        const existing = this.findSandboxById(event.id)
        if (existing) {
          existing.status = "error"
          existing.error = event.error
          existing.updatedAt = event.timestamp
        }
        break
      }
      case "sandbox_health_updated": {
        const existing = this.findSandboxById(event.id)
        if (existing) {
          existing.lastHealthCheck = event.timestamp
          existing.updatedAt = event.timestamp
        }
        break
      }
      case "provider_profile_saved": {
        const existingProfile = this.state.providerProfiles.get(event.profileId)
        this.state.providerProfiles.set(event.profileId, {
          id: event.profileId,
          profile: event.profile,
          createdAt: existingProfile?.createdAt ?? event.timestamp,
          updatedAt: event.timestamp,
        })
        break
      }
      case "provider_profile_removed": {
        this.state.providerProfiles.delete(event.profileId)
        for (const [, overrides] of this.state.workspaceProfileOverrides) {
          overrides.delete(event.profileId)
        }
        break
      }
      case "team_member_saved": {
        this.state.teamMembers.set(event.memberId, event.member)
        break
      }
      case "team_member_removed": {
        this.state.teamMembers.delete(event.memberId)
        // Cascade: unassign any runner that pointed at the removed member.
        for (const [runnerId, label] of this.state.runnerLabels) {
          if (label.memberId === event.memberId) {
            this.state.runnerLabels.set(runnerId, { ...label, memberId: null, updatedAt: event.timestamp })
          }
        }
        break
      }
      case "runner_label_set": {
        // Upsert by runnerId. A label with neither a name nor a member is still
        // a valid record (the reducer never prunes — removal is explicit).
        this.state.runnerLabels.set(event.runnerId, {
          runnerId: event.runnerId,
          name: event.name,
          memberId: event.memberId,
          updatedAt: event.timestamp,
        })
        break
      }
      case "runner_label_removed": {
        this.state.runnerLabels.delete(event.runnerId)
        break
      }
      case "workspace_profile_override_set": {
        const wsOverrides = this.state.workspaceProfileOverrides.get(event.workspaceId) ?? new Map<string, WorkspaceProfileOverride>()
        wsOverrides.set(event.profileId, {
          profileId: event.profileId,
          workspaceId: event.workspaceId,
          overrides: event.overrides,
          updatedAt: event.timestamp,
        })
        this.state.workspaceProfileOverrides.set(event.workspaceId, wsOverrides)
        break
      }
      case "workspace_profile_override_removed": {
        this.state.workspaceProfileOverrides.get(event.workspaceId)?.delete(event.profileId)
        break
      }
      case "extension_preference_set": {
        this.state.extensionPreferences.set(event.extensionId, {
          extensionId: event.extensionId,
          enabled: event.enabled,
          updatedAt: event.timestamp,
        })
        break
      }
      case "delegation_initiated":
      case "delegation_completed":
        // Audit-only — KV is the source of truth for delegation state
        break
    }
  }

  private findSandboxById(id: string): SandboxRecord | undefined {
    for (const sb of this.state.sandboxByWorkspace.values()) {
      if (sb.id === id) return sb
    }
    return undefined
  }

  private getOrCreateCoordination(workspaceId: string) {
    let coord = this.state.coordinationByWorkspace.get(workspaceId)
    if (!coord) {
      coord = createEmptyCoordinationState()
      this.state.coordinationByWorkspace.set(workspaceId, coord)
    }
    return coord
  }

  private applyMessageMetadata(chatId: string, entry: TranscriptEntry) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat) return
    if (entry.kind === "user_prompt") {
      chat.lastMessageAt = entry.createdAt
    }
    chat.updatedAt = Math.max(chat.updatedAt, entry.createdAt)
  }

  private append<TEvent extends StoreEvent>(filePath: string, event: TEvent) {
    const payload = `${JSON.stringify(event)}\n`
    this.writeChain = this.writeChain.then(async () => {
      await appendFile(filePath, payload, "utf8")
      this.applyEvent(event)
    })
    return this.writeChain
  }

  private transcriptPath(chatId: string) {
    return path.join(this.transcriptsDir, `${chatId}.jsonl`)
  }

  private async loadTranscriptFromDisk(chatId: string): Promise<TranscriptEntry[]> {
    const transcriptPath = this.transcriptPath(chatId)
    const file = Bun.file(transcriptPath)
    if (!await file.exists()) {
      return []
    }

    const text = await file.text()
    if (!text.trim()) return []

    const entries: TranscriptEntry[] = []
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim()
      if (!line) continue
      try {
        entries.push(JSON.parse(line) as TranscriptEntry)
      } catch (_err: unknown) {
        // Skip malformed JSONL lines — one bad line must not crash transcript loading
      }
    }
    return entries
  }

  private setTranscriptCache(chatId: string, entries: TranscriptEntry[]) {
    this.transcriptCache.delete(chatId) // Remove to refresh insertion order
    this.transcriptCache.set(chatId, entries)
    if (this.transcriptCache.size > EventStore.TRANSCRIPT_CACHE_MAX) {
      const oldest = this.transcriptCache.keys().next().value
      if (oldest) this.transcriptCache.delete(oldest)
    }
  }

  async openProject(localPath: string, title?: string) {
    const normalized = resolveLocalPath(localPath)
    const existingId = this.state.workspaceIdsByPath.get(normalized)
    if (existingId) {
      const existing = this.state.workspacesById.get(existingId)
      if (existing && !existing.deletedAt) {
        return existing
      }
    }

    const workspaceId = crypto.randomUUID()
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "workspace_opened",
      timestamp: Date.now(),
      workspaceId,
      localPath: normalized,
      title: title?.trim() || path.basename(normalized) || normalized,
    }
    await this.append(this.projectsLogPath, event)
    return this.state.workspacesById.get(workspaceId)!
  }

  async removeProject(workspaceId: string) {
    const project = this.getProject(workspaceId)
    if (!project) {
      throw new Error("Project not found")
    }

    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "workspace_removed",
      timestamp: Date.now(),
      workspaceId,
    }
    await this.append(this.projectsLogPath, event)
  }

  async createIndependentWorkspace(name: string) {
    const workspaceId = crypto.randomUUID()
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "independent_workspace_created",
      timestamp: Date.now(),
      workspaceId,
      name: name.trim(),
    }
    await this.append(this.projectsLogPath, event)
    return this.state.independentWorkspacesById.get(workspaceId)!
  }

  async deleteIndependentWorkspace(workspaceId: string) {
    const workspace = this.state.independentWorkspacesById.get(workspaceId)
    if (!workspace) {
      throw new Error("Independent workspace not found")
    }
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "independent_workspace_deleted",
      timestamp: Date.now(),
      workspaceId,
    }
    await this.append(this.projectsLogPath, event)
  }

  async renameIndependentWorkspace(workspaceId: string, name: string) {
    if (!this.state.independentWorkspacesById.has(workspaceId)) {
      throw new Error("Independent workspace not found")
    }
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "independent_workspace_renamed",
      timestamp: Date.now(),
      workspaceId,
      name: name.trim(),
    }
    await this.append(this.projectsLogPath, event)
  }

  async setIndependentWorkspacePinned(workspaceId: string, pinned: boolean) {
    if (!this.state.independentWorkspacesById.has(workspaceId)) {
      throw new Error("Independent workspace not found")
    }
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "independent_workspace_pin_toggled",
      timestamp: Date.now(),
      workspaceId,
      pinned,
    }
    await this.append(this.projectsLogPath, event)
  }

  async reorderIndependentWorkspaces(orderedWorkspaceIds: string[]) {
    for (const id of orderedWorkspaceIds) {
      if (!this.state.independentWorkspacesById.has(id)) {
        throw new Error("Independent workspace not found")
      }
    }
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "independent_workspaces_reordered",
      timestamp: Date.now(),
      orderedWorkspaceIds,
    }
    await this.append(this.projectsLogPath, event)
  }

  listIndependentWorkspaces() {
    return [...this.state.independentWorkspacesById.values()].sort(compareIndependentWorkspaces)
  }

  async createChat(workspaceId: string, repoId?: string, chatId?: string) {
    const project = this.state.workspacesById.get(workspaceId)
    if (!project || project.deletedAt) {
      throw new Error("Project not found")
    }
    const nextChatId = chatId ?? crypto.randomUUID()
    const existing = this.state.chatsById.get(nextChatId)
    if (existing && !existing.deletedAt) {
      if (existing.workspaceId !== workspaceId) {
        throw new Error("Chat already exists for another project")
      }
      return existing
    }
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_created",
      timestamp: Date.now(),
      chatId: nextChatId,
      workspaceId,
      title: "New Chat",
      ...(repoId ? { repoId } : {}),
    }
    await this.append(this.chatsLogPath, event)
    return this.state.chatsById.get(nextChatId)!
  }

  async renameChat(chatId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    const chat = this.requireChat(chatId)
    if (chat.title === trimmed) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_renamed",
      timestamp: Date.now(),
      chatId,
      title: trimmed,
    }
    await this.append(this.chatsLogPath, event)
  }

  async deleteChat(chatId: string) {
    this.requireChat(chatId)
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_deleted",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatProvider(chatId: string, provider: AgentProvider) {
    const chat = this.requireChat(chatId)
    if (chat.provider === provider) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_provider_set",
      timestamp: Date.now(),
      chatId,
      provider,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatRunner(chatId: string, runnerId: string | null) {
    const chat = this.requireChat(chatId)
    if ((chat.runnerId ?? null) === runnerId) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_runner_set",
      timestamp: Date.now(),
      chatId,
      runnerId,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setPlanMode(chatId: string, planMode: boolean) {
    const chat = this.requireChat(chatId)
    if (chat.planMode === planMode) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_plan_mode_set",
      timestamp: Date.now(),
      chatId,
      planMode,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatModel(chatId: string, model: string | null) {
    const chat = this.requireChat(chatId)
    if ((chat.model ?? null) === model) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_model_set",
      timestamp: Date.now(),
      chatId,
      model,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatReadState(chatId: string, unread: boolean) {
    const chat = this.requireChat(chatId)
    if (chat.unread === unread) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_read_state_set",
      timestamp: Date.now(),
      chatId,
      unread,
    }
    await this.append(this.chatsLogPath, event)
  }

  appendMessage(chatId: string, entry: TranscriptEntry) {
    this.requireChat(chatId)
    // In-memory first so NATS publish fires without waiting for disk I/O
    this.applyMessageMetadata(chatId, entry)
    const cached = this.transcriptCache.get(chatId)
    if (cached) {
      cached.push({ ...entry })
    }
    const payload = `${JSON.stringify(entry)}\n`
    const transcriptPath = this.transcriptPath(chatId)
    this.writeChain = this.writeChain.then(() => appendFile(transcriptPath, payload, "utf8"))
  }

  async recordTurnStarted(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_started",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordTurnFinished(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_finished",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordTurnFailed(chatId: string, error: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_failed",
      timestamp: Date.now(),
      chatId,
      error,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordTurnCancelled(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_cancelled",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async enqueueQueuedTurn(args: {
    chatId: string
    provider?: AgentProvider
    content: string
    model?: string
    modelOptions?: import("../shared/types").ModelOptions
    effort?: string
    planMode?: boolean
  }) {
    this.requireChat(args.chatId)
    const content = args.content.trim()
    if (!content) return
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "chat_turn_queued",
      timestamp: Date.now(),
      chatId: args.chatId,
      provider: args.provider,
      content,
      model: args.model,
      modelOptions: args.modelOptions,
      effort: args.effort,
      planMode: args.planMode,
    }
    await this.append(this.turnsLogPath, event)
  }

  getQueuedTurn(chatId: string): QueuedChatTurnRecord | null {
    const queued = this.state.queuedTurnsByChat.get(chatId)
    return queued ? { ...queued } : null
  }

  async clearQueuedTurn(chatId: string) {
    if (!this.state.queuedTurnsByChat.has(chatId)) return
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "chat_queued_turn_cleared",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordDelegationInitiated(workspaceId: string, args: { delegationId: string; parentChatId: string; childChatId: string; mode: "blocking" | "background"; resume: "immediate" | "gate" }) {
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "delegation_initiated",
      timestamp: Date.now(),
      delegationId: args.delegationId,
      parentChatId: args.parentChatId,
      childChatId: args.childChatId,
      workspaceId,
      mode: args.mode,
      resume: args.resume,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordDelegationCompleted(workspaceId: string, args: { delegationId: string; parentChatId: string; childChatId: string; outcome: "completed" | "failed" | "orphaned" | "stale" }) {
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "delegation_completed",
      timestamp: Date.now(),
      delegationId: args.delegationId,
      parentChatId: args.parentChatId,
      childChatId: args.childChatId,
      workspaceId,
      outcome: args.outcome,
    }
    await this.append(this.turnsLogPath, event)
  }

  async setSessionToken(chatId: string, sessionToken: string | null) {
    const chat = this.requireChat(chatId)
    if (chat.sessionToken === sessionToken) return
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "session_token_set",
      timestamp: Date.now(),
      chatId,
      sessionToken,
    }
    await this.append(this.turnsLogPath, event)
  }

  // --- Coordination mutation methods ---

  async addTodo(workspaceId: string, todoId: string, description: string, priority: "high" | "normal" | "low", createdBy: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_added", timestamp: Date.now(), workspaceId, todoId, description, priority, createdBy }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async claimTodo(workspaceId: string, todoId: string, claimedBy: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_claimed", timestamp: Date.now(), workspaceId, todoId, claimedBy }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async completeTodo(workspaceId: string, todoId: string, outputs: string[]) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_completed", timestamp: Date.now(), workspaceId, todoId, outputs }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async abandonTodo(workspaceId: string, todoId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_abandoned", timestamp: Date.now(), workspaceId, todoId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async createClaim(workspaceId: string, claimId: string, intent: string, files: string[], sessionId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "claim_created", timestamp: Date.now(), workspaceId, claimId, intent, files, sessionId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)

    // Auto-detect file overlap with existing active claims.
    // INVARIANT: append() updates in-memory state synchronously via applyEvent(),
    // so coordinationByWorkspace is already current when we read it here.
    // Only the first overlapping claim triggers a conflict event (intentional —
    // downstream can trace the full conflict chain via claim_conflict_detected events).
    const coord = this.state.coordinationByWorkspace.get(workspaceId)
    if (coord) {
      const fileSet = new Set(files)
      for (const [existingId, existing] of coord.claims) {
        if (existingId === claimId || existing.status !== "active") continue
        const overlapping = existing.files.filter((f) => fileSet.has(f))
        if (overlapping.length > 0) {
          const conflictEvent: CoordinationEvent = {
            v: STORE_VERSION, type: "claim_conflict_detected", timestamp: Date.now(),
            workspaceId, claimId, conflictsWith: existingId, overlappingFiles: overlapping,
          }
          await this.append<CoordinationEvent>(this.coordinationLogPath, conflictEvent)
          break
        }
      }
    }
  }

  async releaseClaim(workspaceId: string, claimId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "claim_released", timestamp: Date.now(), workspaceId, claimId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async createWorktree(workspaceId: string, worktreeId: string, branch: string, baseBranch: string, wtPath: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "worktree_created", timestamp: Date.now(), workspaceId, worktreeId, branch, baseBranch, path: wtPath }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async assignWorktree(workspaceId: string, worktreeId: string, sessionId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "worktree_assigned", timestamp: Date.now(), workspaceId, worktreeId, sessionId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async removeWorktree(workspaceId: string, worktreeId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "worktree_removed", timestamp: Date.now(), workspaceId, worktreeId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async setRule(workspaceId: string, ruleId: string, content: string, setBy: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "rule_set", timestamp: Date.now(), workspaceId, ruleId, content, setBy }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async removeRule(workspaceId: string, ruleId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "rule_removed", timestamp: Date.now(), workspaceId, ruleId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  // --- Agent config mutation methods ---

  async saveAgentConfig(workspaceId: string, agentId: string, config: AgentConfig) {
    const event: AgentConfigEvent = { v: STORE_VERSION, type: "agent_config_saved", timestamp: Date.now(), workspaceId, agentId, config }
    await this.append<AgentConfigEvent>(this.agentConfigsLogPath, event)
  }

  async commitAgentConfig(workspaceId: string, agentId: string, commitHash: string) {
    const event: AgentConfigEvent = { v: STORE_VERSION, type: "agent_config_committed", timestamp: Date.now(), workspaceId, agentId, commitHash }
    await this.append<AgentConfigEvent>(this.agentConfigsLogPath, event)
  }

  async removeAgentConfig(workspaceId: string, agentId: string) {
    const event: AgentConfigEvent = { v: STORE_VERSION, type: "agent_config_removed", timestamp: Date.now(), workspaceId, agentId }
    await this.append<AgentConfigEvent>(this.agentConfigsLogPath, event)
  }

  // --- Provider profile mutation methods ---

  async saveProviderProfile(profileId: string, profile: ProviderProfile) {
    const event: ProviderProfileEvent = { v: STORE_VERSION, type: "provider_profile_saved", timestamp: Date.now(), profileId, profile }
    await this.append<ProviderProfileEvent>(this.profilesLogPath, event)
  }

  async removeProviderProfile(profileId: string) {
    const event: ProviderProfileEvent = { v: STORE_VERSION, type: "provider_profile_removed", timestamp: Date.now(), profileId }
    await this.append<ProviderProfileEvent>(this.profilesLogPath, event)
  }

  async setWorkspaceProfileOverride(workspaceId: string, profileId: string, overrides: Partial<Omit<ProviderProfile, "id" | "provider">>) {
    const event: ProviderProfileEvent = { v: STORE_VERSION, type: "workspace_profile_override_set", timestamp: Date.now(), workspaceId, profileId, overrides }
    await this.append<ProviderProfileEvent>(this.profilesLogPath, event)
  }

  async removeWorkspaceProfileOverride(workspaceId: string, profileId: string) {
    const event: ProviderProfileEvent = { v: STORE_VERSION, type: "workspace_profile_override_removed", timestamp: Date.now(), workspaceId, profileId }
    await this.append<ProviderProfileEvent>(this.profilesLogPath, event)
  }

  // --- Extension preference mutation methods ---

  async setExtensionPreference(extensionId: string, enabled: boolean) {
    const event: ExtensionPreferenceEvent = { v: STORE_VERSION, type: "extension_preference_set", timestamp: Date.now(), extensionId, enabled }
    await this.append<ExtensionPreferenceEvent>(this.extensionPrefsLogPath, event)
  }

  // --- Runner team mutation methods (US-RTN) ---

  async saveTeamMember(member: TeamMember) {
    const event: RunnerTeamEvent = { v: STORE_VERSION, type: "team_member_saved", timestamp: Date.now(), memberId: member.id, member }
    await this.append<RunnerTeamEvent>(this.runnerTeamsLogPath, event)
  }

  async removeTeamMember(memberId: string) {
    const event: RunnerTeamEvent = { v: STORE_VERSION, type: "team_member_removed", timestamp: Date.now(), memberId }
    await this.append<RunnerTeamEvent>(this.runnerTeamsLogPath, event)
  }

  async setRunnerLabel(runnerId: string, name: string | null, memberId: string | null) {
    const event: RunnerTeamEvent = { v: STORE_VERSION, type: "runner_label_set", timestamp: Date.now(), runnerId, name, memberId }
    await this.append<RunnerTeamEvent>(this.runnerTeamsLogPath, event)
  }

  async removeRunnerLabel(runnerId: string) {
    const event: RunnerTeamEvent = { v: STORE_VERSION, type: "runner_label_removed", timestamp: Date.now(), runnerId }
    await this.append<RunnerTeamEvent>(this.runnerTeamsLogPath, event)
  }

  // --- Repo mutation methods ---

  async addRepo(id: string, workspaceId: string, localPath: string, origin: string | null, label: string | null, branch: string | null) {
    const event: RepoEvent = { v: STORE_VERSION, type: "repo_added", timestamp: Date.now(), id, workspaceId, localPath, origin, label, branch }
    await this.append<RepoEvent>(this.reposLogPath, event)
  }

  async startRepoClone(id: string, workspaceId: string, origin: string, targetPath: string, label: string | null) {
    const event: RepoEvent = { v: STORE_VERSION, type: "repo_clone_started", timestamp: Date.now(), id, workspaceId, origin, targetPath, label }
    await this.append<RepoEvent>(this.reposLogPath, event)
  }

  async markRepoCloned(id: string, localPath: string, branch: string | null) {
    const event: RepoEvent = { v: STORE_VERSION, type: "repo_cloned", timestamp: Date.now(), id, localPath, branch }
    await this.append<RepoEvent>(this.reposLogPath, event)
  }

  async markRepoCloneFailed(id: string, error: string) {
    const event: RepoEvent = { v: STORE_VERSION, type: "repo_clone_failed", timestamp: Date.now(), id, error }
    await this.append<RepoEvent>(this.reposLogPath, event)
  }

  async removeRepo(id: string, workspaceId: string) {
    const event: RepoEvent = { v: STORE_VERSION, type: "repo_removed", timestamp: Date.now(), id, workspaceId }
    await this.append<RepoEvent>(this.reposLogPath, event)
  }

  async updateRepoLabel(id: string, label: string) {
    const event: RepoEvent = { v: STORE_VERSION, type: "repo_label_updated", timestamp: Date.now(), id, label }
    await this.append<RepoEvent>(this.reposLogPath, event)
  }

  // --- Workflow mutation methods ---

  async emitWorkflowStarted(runId: string, workflowId: string, workspaceId: string, targetRepoIds: string[], triggeredBy: string) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_started", timestamp: Date.now(), runId, workflowId, workspaceId, targetRepoIds, triggeredBy }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  async emitWorkflowStepStarted(runId: string, workspaceId: string, stepIndex: number, mcpTool: string, repoId?: string) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_step_started", timestamp: Date.now(), runId, workspaceId, stepIndex, mcp_tool: mcpTool, ...(repoId !== undefined ? { repoId } : {}) }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  async emitWorkflowStepCompleted(runId: string, workspaceId: string, stepIndex: number, output: string, repoId?: string) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_step_completed", timestamp: Date.now(), runId, workspaceId, stepIndex, output, ...(repoId !== undefined ? { repoId } : {}) }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  async emitWorkflowStepFailed(runId: string, workspaceId: string, stepIndex: number, error: string, repoId?: string) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_step_failed", timestamp: Date.now(), runId, workspaceId, stepIndex, error, ...(repoId !== undefined ? { repoId } : {}) }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  async emitWorkflowCompleted(runId: string, workspaceId: string) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_completed", timestamp: Date.now(), runId, workspaceId }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  async emitWorkflowFailed(runId: string, workspaceId: string, error: string, failedStep: number) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_failed", timestamp: Date.now(), runId, workspaceId, error, failedStep }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  async emitWorkflowCancelled(runId: string, workspaceId: string) {
    const event: WorkflowEvent = { v: STORE_VERSION, type: "workflow_cancelled", timestamp: Date.now(), runId, workspaceId }
    await this.append<WorkflowEvent>(this.workflowsLogPath, event)
  }

  // --- Sandbox mutation methods ---

  async emitSandboxCreated(id: string, workspaceId: string, resourceLimits: import("../shared/sandbox-types").ResourceLimits) {
    await this.append<SandboxEvent>(this.sandboxLogPath, { v: 3, type: "sandbox_created", timestamp: Date.now(), id, workspaceId, resourceLimits })
  }

  async emitSandboxStarted(id: string, containerId: string, natsUrl: string) {
    await this.append<SandboxEvent>(this.sandboxLogPath, { v: 3, type: "sandbox_started", timestamp: Date.now(), id, containerId, natsUrl })
  }

  async emitSandboxStopped(id: string, reason: string) {
    await this.append<SandboxEvent>(this.sandboxLogPath, { v: 3, type: "sandbox_stopped", timestamp: Date.now(), id, reason })
  }

  async emitSandboxDestroyed(id: string) {
    await this.append<SandboxEvent>(this.sandboxLogPath, { v: 3, type: "sandbox_destroyed", timestamp: Date.now(), id })
  }

  async emitSandboxError(id: string, error: string) {
    await this.append<SandboxEvent>(this.sandboxLogPath, { v: 3, type: "sandbox_error", timestamp: Date.now(), id, error })
  }

  async emitSandboxHealthUpdated(id: string, health: import("../shared/sandbox-types").SandboxHealthReport) {
    await this.append<SandboxEvent>(this.sandboxLogPath, { v: 3, type: "sandbox_health_updated", timestamp: Date.now(), id, health })
  }

  getProject(workspaceId: string) {
    const project = this.state.workspacesById.get(workspaceId)
    if (!project || project.deletedAt) return null
    return project
  }

  requireChat(chatId: string) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat || chat.deletedAt) {
      throw new Error("Chat not found")
    }
    return chat
  }

  getChat(chatId: string) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat || chat.deletedAt) return null
    return chat
  }

  async getMessages(chatId: string, options?: { offset?: number; limit?: number }) {
    let entries: TranscriptEntry[]

    if (this.transcriptCache.has(chatId)) {
      entries = this.transcriptCache.get(chatId)!
    } else {
      const legacyEntries = this.legacyMessagesByChatId.get(chatId)
      if (legacyEntries) {
        this.setTranscriptCache(chatId, cloneTranscriptEntries(legacyEntries))
        entries = this.transcriptCache.get(chatId)!
      } else {
        // Drain pending writes before reading from disk to ensure consistency
        await this.writeChain
        entries = await this.loadTranscriptFromDisk(chatId)
        this.setTranscriptCache(chatId, entries)
      }
    }

    if (options?.offset !== undefined || options?.limit !== undefined) {
      const start = options.offset ?? 0
      const end = options.limit !== undefined ? start + options.limit : undefined
      return cloneTranscriptEntries(entries.slice(start, end))
    }

    return cloneTranscriptEntries(entries)
  }

  async getMessageCount(chatId: string): Promise<number> {
    if (this.transcriptCache.has(chatId)) {
      return this.transcriptCache.get(chatId)!.length
    }
    const legacyEntries = this.legacyMessagesByChatId.get(chatId)
    if (legacyEntries) {
      return legacyEntries.length
    }
    await this.writeChain
    const entries = await this.loadTranscriptFromDisk(chatId)
    this.setTranscriptCache(chatId, entries)
    return entries.length
  }

  listProjects() {
    return [...this.state.workspacesById.values()].filter((project) => !project.deletedAt)
  }

  listChatsByProject(workspaceId: string) {
    return [...this.state.chatsById.values()]
      .filter((chat) => chat.workspaceId === workspaceId && !chat.deletedAt)
      .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt))
  }

  getChatCount(workspaceId: string) {
    return this.listChatsByProject(workspaceId).length
  }

  async getLegacyTranscriptStats(): Promise<LegacyTranscriptStats> {
    const messagesLogSize = await Bun.file(this.messagesLogPath).size
    const sources: LegacyTranscriptStats["sources"] = []
    if (this.snapshotHasLegacyMessages) {
      sources.push("snapshot")
    }
    if (messagesLogSize > 0) {
      sources.push("messages_log")
    }

    let entryCount = 0
    for (const entries of this.legacyMessagesByChatId.values()) {
      entryCount += entries.length
    }

    return {
      hasLegacyData: sources.length > 0 || this.legacyMessagesByChatId.size > 0,
      sources,
      chatCount: this.legacyMessagesByChatId.size,
      entryCount,
    }
  }

  async hasLegacyTranscriptData() {
    return (await this.getLegacyTranscriptStats()).hasLegacyData
  }

  private createSnapshot(): SnapshotFile {
    const coordination: SnapshotFile["coordination"] = []
    for (const [workspaceId, coord] of this.state.coordinationByWorkspace) {
      coordination.push({
        workspaceId,
        todos: [...coord.todos.values()],
        claims: [...coord.claims.values()],
        worktrees: [...coord.worktrees.values()],
        rules: [...coord.rules.values()],
      })
    }
    const agentConfigs: SnapshotFile["agentConfigs"] = []
    for (const [workspaceId, configMap] of this.state.agentConfigsByWorkspace) {
      if (configMap.size > 0) {
        agentConfigs.push({ workspaceId, records: [...configMap.values()] })
      }
    }
    return {
      v: STORE_VERSION,
      generatedAt: Date.now(),
      workspaces: this.listProjects().map((project) => ({ ...project })),
      ...(this.state.independentWorkspacesById.size > 0 ? { independentWorkspaces: this.listIndependentWorkspaces() } : {}),
      chats: [...this.state.chatsById.values()]
        .filter((chat) => !chat.deletedAt)
        .map((chat) => ({ ...chat })),
      ...(this.state.queuedTurnsByChat.size > 0 ? {
        queuedTurns: [...this.state.queuedTurnsByChat.values()].map((queued) => ({ ...queued })),
      } : {}),
      ...(coordination.length > 0 ? { coordination } : {}),
      ...(agentConfigs.length > 0 ? { agentConfigs } : {}),
      ...(this.state.reposById.size > 0 ? { repos: [...this.state.reposById.values()] } : {}),
      ...(this.state.workflowRunsByWorkspace.size > 0 ? {
        workflowRuns: [...this.state.workflowRunsByWorkspace.entries()].map(([workspaceId, runsMap]) => ({
          workspaceId,
          runs: [...runsMap.values()],
        })),
      } : {}),
      ...(this.state.sandboxByWorkspace.size > 0 ? {
        sandboxes: [...this.state.sandboxByWorkspace.values()],
      } : {}),
      ...(this.state.providerProfiles.size > 0 ? {
        providerProfiles: [...this.state.providerProfiles.values()],
      } : {}),
      ...(this.state.workspaceProfileOverrides.size > 0 ? {
        workspaceProfileOverrides: [...this.state.workspaceProfileOverrides.values()].flatMap(
          (wsMap) => [...wsMap.values()],
        ),
      } : {}),
      ...(this.state.extensionPreferences.size > 0 ? {
        extensionPreferences: [...this.state.extensionPreferences.values()],
      } : {}),
      ...(this.state.teamMembers.size > 0 ? {
        teamMembers: [...this.state.teamMembers.values()],
      } : {}),
      ...(this.state.runnerLabels.size > 0 ? {
        runnerLabels: [...this.state.runnerLabels.values()],
      } : {}),
    }
  }

  async compact() {
    const snapshot = this.createSnapshot()
    await Bun.write(this.snapshotPath, JSON.stringify(snapshot, null, 2))
    await Promise.all([
      Bun.write(this.projectsLogPath, ""),
      Bun.write(this.chatsLogPath, ""),
      Bun.write(this.messagesLogPath, ""),
      Bun.write(this.turnsLogPath, ""),
      Bun.write(this.coordinationLogPath, ""),
      Bun.write(this.agentConfigsLogPath, ""),
      Bun.write(this.reposLogPath, ""),
      Bun.write(this.workflowsLogPath, ""),
      Bun.write(this.sandboxLogPath, ""),
      Bun.write(this.profilesLogPath, ""),
      Bun.write(this.extensionPrefsLogPath, ""),
      Bun.write(this.runnerTeamsLogPath, ""),
    ])
  }

  async migrateLegacyTranscripts(onProgress?: (message: string) => void) {
    const stats = await this.getLegacyTranscriptStats()
    if (!stats.hasLegacyData) return false

    const sourceSummary = stats.sources.map((source) => source === "messages_log" ? "messages.jsonl" : "snapshot.json").join(", ")
    onProgress?.(`${LOG_PREFIX} transcript migration detected: ${stats.chatCount} chats, ${stats.entryCount} entries from ${sourceSummary}`)

    const messageSets = [...this.legacyMessagesByChatId.entries()]
    onProgress?.(`${LOG_PREFIX} transcript migration: writing ${messageSets.length} per-chat transcript files`)

    await mkdir(this.transcriptsDir, { recursive: true })
    const logEveryChat = messageSets.length <= 10
    for (let index = 0; index < messageSets.length; index += 1) {
      const [chatId, entries] = messageSets[index]
      const transcriptPath = this.transcriptPath(chatId)
      const tempPath = `${transcriptPath}.tmp`
      const payload = entries.map((entry) => JSON.stringify(entry)).join("\n")
      await writeFile(tempPath, payload ? `${payload}\n` : "", "utf8")
      await rename(tempPath, transcriptPath)
      if (logEveryChat || (index + 1) % 25 === 0 || index === messageSets.length - 1) {
        onProgress?.(`${LOG_PREFIX} transcript migration: ${index + 1}/${messageSets.length} chats`)
      }
    }

    this.clearLegacyTranscriptState()
    await this.compact()
    this.transcriptCache.clear()
    onProgress?.(`${LOG_PREFIX} transcript migration complete`)
    return true
  }

  private async shouldCompact() {
    const sizes = await Promise.all([
      Bun.file(this.projectsLogPath).size,
      Bun.file(this.chatsLogPath).size,
      Bun.file(this.messagesLogPath).size,
      Bun.file(this.turnsLogPath).size,
      Bun.file(this.coordinationLogPath).size,
      Bun.file(this.agentConfigsLogPath).size,
      Bun.file(this.reposLogPath).size,
      Bun.file(this.workflowsLogPath).size,
      Bun.file(this.sandboxLogPath).size,
      Bun.file(this.profilesLogPath).size,
      Bun.file(this.extensionPrefsLogPath).size,
      Bun.file(this.runnerTeamsLogPath).size,
    ])
    return sizes.reduce((total, size) => total + size, 0) >= COMPACTION_THRESHOLD_BYTES
  }

  // ===== claude-pty additions (in-memory only — PORT-TODO durable persistence) =====

  private readonly _ptySubagentRuns = new Map<string, Map<string, PtySubagentRunSnapshot>>()
  private readonly _ptyToolRequests = new Map<string, PtyToolRequest>()

  private async replayPtyLogs(): Promise<void> {
    // Subagent log replay
    const subagentFile = Bun.file(this.ptySubagentLogPath)
    if (await subagentFile.exists()) {
      const text = await subagentFile.text()
      for (const line of text.split("\n")) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as PtySubagentRunEvent
          this.applyPtySubagentEvent(event)
        } catch {
          // skip malformed
        }
      }
    }
    // Session token replay
    const tokenFile = Bun.file(this.ptySessionTokensLogPath)
    if (await tokenFile.exists()) {
      const text = await tokenFile.text()
      for (const line of text.split("\n")) {
        if (!line.trim()) continue
        try {
          const rec = JSON.parse(line) as { chatId: string; providerId: string; sessionToken: string | null }
          let map = this._ptySessionTokensByChatId.get(rec.chatId)
          if (!map) {
            map = new Map<string, string>()
            this._ptySessionTokensByChatId.set(rec.chatId, map)
          }
          if (rec.sessionToken === null) {
            map.delete(rec.providerId)
          } else {
            map.set(rec.providerId, rec.sessionToken)
          }
        } catch {
          // skip malformed
        }
      }
    }
    // Tool request log replay
    const toolFile = Bun.file(this.ptyToolRequestsLogPath)
    if (await toolFile.exists()) {
      const text = await toolFile.text()
      for (const line of text.split("\n")) {
        if (!line.trim()) continue
        try {
          const rec = JSON.parse(line) as { type: "put" | "resolved"; request?: PtyToolRequest; id?: string; status?: import("../shared/permission-policy").ToolRequestStatus; decision?: import("../shared/permission-policy").ToolRequestDecision; resolvedAt?: number; mismatchReason?: string }
          if (rec.type === "put" && rec.request) {
            this._ptyToolRequests.set(rec.request.id, { ...rec.request })
          } else if (rec.type === "resolved" && rec.id) {
            const existing = this._ptyToolRequests.get(rec.id)
            if (existing) {
              this._ptyToolRequests.set(rec.id, {
                ...existing,
                status: rec.status ?? existing.status,
                decision: rec.decision ?? existing.decision,
                resolvedAt: rec.resolvedAt ?? existing.resolvedAt,
                mismatchReason: rec.mismatchReason,
              })
            }
          }
        } catch {
          // skip malformed
        }
      }
    }
  }

  private applyPtySubagentEvent(event: PtySubagentRunEvent): void {
    const chatMap = this._ptySubagentRuns.get(event.chatId) ?? new Map<string, PtySubagentRunSnapshot>()
    this._ptySubagentRuns.set(event.chatId, chatMap)
    const existing = chatMap.get(event.runId)
    switch (event.type) {
      case "subagent_run_started":
        chatMap.set(event.runId, {
          runId: event.runId,
          chatId: event.chatId,
          subagentId: event.subagentId,
          subagentName: event.subagentName,
          provider: event.provider,
          model: event.model,
          status: "running",
          parentUserMessageId: event.parentUserMessageId,
          parentRunId: event.parentRunId,
          depth: event.depth,
          startedAt: event.timestamp,
          finishedAt: null,
          finalText: null,
          error: null,
          usage: null,
          entries: [],
          pendingTool: null,
        })
        return
      case "subagent_message_delta":
        if (existing) existing.finalText = (existing.finalText ?? "") + event.content
        return
      case "subagent_entry_appended":
        if (existing) existing.entries.push(event.entry)
        return
      case "subagent_run_completed":
        if (existing) {
          existing.status = "completed"
          existing.finishedAt = event.timestamp
          existing.finalText = event.finalContent
          existing.usage = event.usage ?? null
        }
        return
      case "subagent_run_failed":
        if (existing) {
          existing.status = "failed"
          existing.finishedAt = event.timestamp
          existing.error = event.error
        }
        return
      case "subagent_run_cancelled":
        if (existing) {
          existing.status = "cancelled"
          existing.finishedAt = event.timestamp
        }
        return
      case "subagent_tool_pending":
        if (existing) existing.pendingTool = event.pendingTool
        return
      case "subagent_tool_resolved":
        if (existing) existing.pendingTool = null
        return
    }
  }

  async appendSubagentEvent(event: PtySubagentRunEvent): Promise<void> {
    this.applyPtySubagentEvent(event)
    const payload = `${JSON.stringify(event)}\n`
    this.writeChain = this.writeChain.then(() => appendFile(this.ptySubagentLogPath, payload, "utf8"))
    await this.writeChain
  }

  getSubagentRuns(chatId: string): Record<string, PtySubagentRunSnapshot> {
    const map = this._ptySubagentRuns.get(chatId)
    if (!map) return {}
    return Object.fromEntries(map.entries())
  }

  *runningSubagentRuns(): Iterable<PtySubagentRunSnapshot> {
    for (const map of this._ptySubagentRuns.values()) {
      for (const run of map.values()) {
        if (run.status === "running") yield run
      }
    }
  }

  async putToolRequest(req: PtyToolRequest): Promise<void> {
    this._ptyToolRequests.set(req.id, { ...req })
    const payload = `${JSON.stringify({ type: "put", request: req })}\n`
    this.writeChain = this.writeChain.then(() => appendFile(this.ptyToolRequestsLogPath, payload, "utf8"))
    await this.writeChain
  }

  getToolRequest(id: string): PtyToolRequest | null {
    const req = this._ptyToolRequests.get(id)
    return req ? { ...req } : null
  }

  listPendingToolRequests(chatId: string): PtyToolRequest[] {
    const out: PtyToolRequest[] = []
    for (const req of this._ptyToolRequests.values()) {
      if (req.chatId !== chatId) continue
      if (req.status !== "pending") continue
      out.push({ ...req })
    }
    return out
  }

  async resolveToolRequest(
    id: string,
    args: {
      status: import("../shared/permission-policy").ToolRequestStatus
      decision?: import("../shared/permission-policy").ToolRequestDecision
      resolvedAt: number
      mismatchReason?: string
    },
  ): Promise<void> {
    const existing = this._ptyToolRequests.get(id)
    if (!existing) throw new Error(`resolveToolRequest: unknown id ${id}`)
    this._ptyToolRequests.set(id, {
      ...existing,
      status: args.status,
      decision: args.decision ?? existing.decision,
      resolvedAt: args.resolvedAt,
      mismatchReason: args.mismatchReason,
    })
    const payload = `${JSON.stringify({ type: "resolved", id, status: args.status, decision: args.decision, resolvedAt: args.resolvedAt, mismatchReason: args.mismatchReason })}\n`
    this.writeChain = this.writeChain.then(() => appendFile(this.ptyToolRequestsLogPath, payload, "utf8"))
    await this.writeChain
  }

  scanAllToolRequests(): PtyToolRequest[] {
    return [...this._ptyToolRequests.values()].map((req) => ({ ...req }))
  }

  /**
   * Generic per-provider session-token setter for claude-pty (and future
   * non-AgentProvider-union backends). `providerId` is a string so PTY can
   * use "claude-pty" without forcing the canonical AgentProvider union to
   * widen.
   */
  async setPtySessionToken(chatId: string, providerId: string, sessionToken: string | null): Promise<void> {
    let map = this._ptySessionTokensByChatId.get(chatId)
    if (!map) {
      map = new Map<string, string>()
      this._ptySessionTokensByChatId.set(chatId, map)
    }
    if (sessionToken === null) {
      map.delete(providerId)
    } else {
      map.set(providerId, sessionToken)
    }
    const payload = `${JSON.stringify({ chatId, providerId, sessionToken, timestamp: Date.now() })}\n`
    this.writeChain = this.writeChain.then(() => appendFile(this.ptySessionTokensLogPath, payload, "utf8"))
    await this.writeChain
  }

  getPtySessionToken(chatId: string, providerId: string): string | null {
    return this._ptySessionTokensByChatId.get(chatId)?.get(providerId) ?? null
  }

  getPtySessionTokensForChat(chatId: string): Record<string, string> {
    const map = this._ptySessionTokensByChatId.get(chatId)
    if (!map) return {}
    return Object.fromEntries(map.entries())
  }
}

// ===== claude-pty shared shapes =====

export interface PtySubagentRunSnapshot {
  runId: string
  chatId: string
  subagentId: string | null
  subagentName: string
  provider: import("../shared/types").AgentProvider
  model: string
  status: "running" | "completed" | "failed" | "cancelled"
  parentUserMessageId: string
  parentRunId: string | null
  depth: number
  startedAt: number
  finishedAt: number | null
  finalText: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: { code: any; message: string } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usage: any | null
  entries: import("../shared/types").TranscriptEntry[]
  pendingTool: import("../shared/types").PendingToolSnapshot | null
}

export type PtySubagentRunEvent =
  | {
      v: 3
      type: "subagent_run_started"
      timestamp: number
      chatId: string
      runId: string
      subagentId: string | null
      subagentName: string
      provider: import("../shared/types").AgentProvider
      model: string
      parentUserMessageId: string
      parentRunId: string | null
      depth: number
    }
  | {
      v: 3
      type: "subagent_message_delta"
      timestamp: number
      chatId: string
      runId: string
      content: string
    }
  | {
      v: 3
      type: "subagent_run_completed"
      timestamp: number
      chatId: string
      runId: string
      finalContent: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      usage?: any
    }
  | {
      v: 3
      type: "subagent_run_failed"
      timestamp: number
      chatId: string
      runId: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: { code: any; message: string }
    }
  | {
      v: 3
      type: "subagent_run_cancelled"
      timestamp: number
      chatId: string
      runId: string
    }
  | {
      v: 3
      type: "subagent_entry_appended"
      timestamp: number
      chatId: string
      runId: string
      entry: import("../shared/types").TranscriptEntry
    }
  | {
      v: 3
      type: "subagent_tool_pending"
      timestamp: number
      chatId: string
      runId: string
      pendingTool: import("../shared/types").PendingToolSnapshot
    }
  | {
      v: 3
      type: "subagent_tool_resolved"
      timestamp: number
      chatId: string
      runId: string
    }

export type PtyToolRequest = import("../shared/permission-policy").ToolRequest

import type { NatsConnection, Msg, Subscription } from "@nats-io/transport-node"
import { stat } from "node:fs/promises"
import type { ClientCommand } from "../shared/protocol"
import type { DiscoveredProject } from "./discovery"
import type { EventStore } from "./event-store"
import { openExternal } from "./external-open"
import { ensureProjectDirectory, resolveLocalPath } from "./paths"
import type { TerminalManager } from "./terminal-manager"
import type { UpdateManager } from "./update-manager"
import type { NatsPublisher } from "./nats-publisher"
import { commandSubject } from "../shared/nats-subjects"
import { LOG_PREFIX } from "../shared/branding"
import { compressPayload } from "../shared/compression"
import { inspectSessionRuntime, readSessionTranscript } from "./session-discovery"
import { DEFAULT_RESOURCE_LIMITS } from "../shared/sandbox-types"
import { readRepoStatus } from "./repo-status"
import { generateForkPromptForChat } from "./generate-fork-context"
import { generateMergePromptForChats as defaultGenerateMergePrompt } from "./generate-merge-context"
import type { TranscriptEntry } from "../shared/types"
import { deriveTranscriptRenderUnits } from "./read-models"
import { deriveCoordinationSnapshot, deriveAgentConfigSnapshot } from "./read-models"
import type { WorkspaceDirectoryPolicy } from "./workspace-directory-policy"
import type { RepoManager } from "./repo-manager"
import type { GitClonePolicy } from "./git-clone-policy"
import type { RuntimeRegistry } from "./runtime-registry"
import { resolveProfile } from "../shared/profile-types"
import { RunnerPickRequired } from "./runner-proxy"

/** Session coordinator interface — RunnerProxy delegates turn execution to the runner process */
interface Coordinator {
  send(command: Extract<ClientCommand, { type: "chat.send" }>): Promise<{ chatId: string }>
  queue(command: Extract<ClientCommand, { type: "chat.queue" }>): Promise<{ chatId: string; queued: boolean }>
  cancel(chatId: string): Promise<void>
  respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void>
  disposeChat(chatId: string): Promise<void>
}

const encoder = new TextEncoder()
const MAX_LOCAL_FILE_PREVIEW_BYTES = 256 * 1024

function encode(data: unknown): Uint8Array {
  return compressPayload(encoder.encode(JSON.stringify(data)))
}

export interface RegisterRespondersArgs {
  nc: NatsConnection
  store: EventStore
  agent: Coordinator
  terminals: TerminalManager
  refreshDiscovery: () => Promise<DiscoveredProject[]>
  /** @deprecated Unused by responders -- kept for interface compatibility with tests */
  getDiscoveredProjects?: () => DiscoveredProject[]
  /** @deprecated Unused by responders -- kept for interface compatibility with tests */
  machineDisplayName?: string
  updateManager: UpdateManager | null
  publisher: NatsPublisher
  onStateChange: () => void
  generateForkPrompt?: (forkIntent: string, entries: TranscriptEntry[], cwd: string, preset?: string) => Promise<string>
  generateMergePrompt?: (mergeIntent: string, sessions: { chatId: string; entries: TranscriptEntry[] }[], cwd: string, preset?: string) => Promise<string>
  directoryPolicy: WorkspaceDirectoryPolicy | null
  repoManager: RepoManager | null
  clonePolicy: GitClonePolicy | null
  workflowEngine: import("./workflow-engine").WorkflowEngine | null
  workflowStore: import("./workflow-store").WorkflowStore | null
  sandboxManager: import("./sandbox-manager").SandboxManager | null
  runtimeRegistry: RuntimeRegistry | null
}

/** Command types that do NOT mutate state and should NOT trigger onStateChange */
const NON_MUTATING: ReadonlySet<ClientCommand["type"]> = new Set([
  "system.ping",
  "terminal.input",
  "terminal.resize",
  "terminal.create",
  "update.check",
  "update.install",
  "system.readLocalFilePreview",
  "chat.getMessages",
  "chat.generateForkPrompt",
  "chat.generateMergePrompt",
  "chat.getSessionRuntime",
  "chat.getRepoStatus",
  "chat.getMessageCount",
  "chat.getRenderUnits",
  "chat.getExternalSessionMessages",
  "snapshot.subscribe",
  "snapshot.unsubscribe",
  "workspace.coordination.snapshot",
  "workspace.agent.list",
  "workspace.agent.get",
  "workspace.repo.status",
  "workspace.workflow.list",
  "workspace.sandbox.logs",
  "workspace.sandbox.status",
  "runtime.list",
  "runtime.health",
  "profile.list",
  "profile.resolve",
  "extension.preference.list",
])

/** Commands handled by the Bun backend. */
const SERVER_COMMANDS: readonly ClientCommand["type"][] = [
  "project.open",
  "project.create",
  "project.remove",
  "independent-workspace.create",
  "independent-workspace.delete",
  "independent-workspace.rename",
  "independent-workspace.set-pinned",
  "independent-workspace.reorder",
  "system.ping",
  "update.check",
  "update.install",
  "system.openExternal",
  "system.readLocalFilePreview",
  "chat.create",
  "chat.rename",
  "chat.delete",
  "chat.markRead",
  "chat.send",
  "chat.queue",
  "chat.cancel",
  "chat.respondTool",
  "chat.generateForkPrompt",
  "chat.generateMergePrompt",
  "chat.getSessionRuntime",
  "chat.getRepoStatus",
  "chat.getMessageCount",
  "chat.getRenderUnits",
  "chat.getExternalSessionMessages",
  "terminal.create",
  "terminal.input",
  "terminal.resize",
  "terminal.close",
  "chat.getMessages",
  "snapshot.subscribe",
  "snapshot.unsubscribe",
  "workspace.todo.add",
  "workspace.todo.claim",
  "workspace.todo.complete",
  "workspace.todo.abandon",
  "workspace.claim.create",
  "workspace.claim.release",
  "workspace.worktree.create",
  "workspace.worktree.assign",
  "workspace.worktree.remove",
  "workspace.rule.set",
  "workspace.rule.remove",
  "workspace.coordination.snapshot",
  "workspace.agent.save",
  "workspace.agent.list",
  "workspace.agent.get",
  "workspace.agent.remove",
  "workspace.repo.add",
  "workspace.repo.clone",
  "workspace.repo.remove",
  "workspace.repo.label",
  "workspace.repo.status",
  "workspace.repo.pull",
  "workspace.repo.push",
  "workspace.workflow.run",
  "workspace.workflow.cancel",
  "workspace.workflow.list",
  "workspace.sandbox.create",
  "workspace.sandbox.start",
  "workspace.sandbox.stop",
  "workspace.sandbox.destroy",
  "workspace.sandbox.logs",
  "workspace.sandbox.status",
  "runtime.list",
  "runtime.detect",
  "runtime.install",
  "runtime.remove",
  "runtime.health",
  "profile.list",
  "profile.save",
  "profile.remove",
  "profile.resolve",
  "workspace.profile.override.set",
  "workspace.profile.override.remove",
  "extension.preference.set",
  "extension.preference.list",
  "chat.selectRunner",
]

const DETECT_OPTIONS: Record<string, { binaryName: string; packageName: string; versionParser: (stdout: string) => string }> = {
  claude: {
    binaryName: "claude",
    packageName: "@anthropic-ai/claude-code",
    versionParser: (stdout: string) => stdout.replace(/[^0-9.]/g, "").trim() || "unknown",
  },
  codex: {
    binaryName: "codex",
    packageName: "@openai/codex",
    versionParser: (stdout: string) => stdout.replace(/[^0-9.]/g, "").trim() || "unknown",
  },
}

const INSTALL_OPTIONS: Record<string, { packageName: string; binaryName: string }> = {
  claude: { packageName: "@anthropic-ai/claude-code", binaryName: "claude" },
  codex: { packageName: "@openai/codex", binaryName: "codex" },
}

export function registerCommandResponders(args: RegisterRespondersArgs): { dispose: () => void } {
  const {
    nc,
    store,
    agent,
    terminals,
    refreshDiscovery,
    updateManager,
    publisher,
    onStateChange,
    generateForkPrompt = generateForkPromptForChat,
    generateMergePrompt = defaultGenerateMergePrompt,
  } = args

  const subs: Subscription[] = SERVER_COMMANDS.map((type) => nc.subscribe(commandSubject(type)))

  async function handleMessage(msg: Msg): Promise<void> {
    let command: ClientCommand
    try {
      command = msg.json<ClientCommand>()
    } catch (_err: unknown) {
      msg.respond(encode({ ok: false, error: "Invalid JSON payload" }))
      return
    }

    if (!command || typeof command !== "object" || typeof command.type !== "string") {
      msg.respond(encode({ ok: false, error: "Missing command type" }))
      return
    }

    try {
      const result = await executeCommand(command)
      msg.respond(encode({ ok: true, result }))

      if (!NON_MUTATING.has(command.type)) {
        onStateChange()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      msg.respond(encode({ ok: false, error: message }))
    }
  }

  async function executeCommand(command: ClientCommand): Promise<unknown> {
    switch (command.type) {
      case "system.ping":
        return undefined

      case "update.check": {
        if (!updateManager) {
          return {
            currentVersion: "unknown",
            latestVersion: null,
            status: "error",
            updateAvailable: false,
            lastCheckedAt: Date.now(),
            error: "Update manager unavailable.",
            installAction: "restart",
          }
        }
        return updateManager.checkForUpdates({ force: command.force })
      }

      case "update.install": {
        if (!updateManager) {
          throw new Error("Update manager unavailable.")
        }
        return updateManager.installUpdate()
      }

      case "project.open": {
        await ensureProjectDirectory(command.localPath)
        const project = await store.openProject(command.localPath)
        await refreshDiscovery()
        if (args.directoryPolicy) {
          args.directoryPolicy.onWorkspaceOpened(project.id).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} workspace dir init error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { workspaceId: project.id }
      }

      case "project.create": {
        await ensureProjectDirectory(command.localPath)
        const project = await store.openProject(command.localPath, command.title)
        await refreshDiscovery()
        if (args.directoryPolicy) {
          args.directoryPolicy.onWorkspaceOpened(project.id).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} workspace dir init error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { workspaceId: project.id }
      }

      case "project.remove": {
        const project = store.getProject(command.workspaceId)
        for (const chat of store.listChatsByProject(command.workspaceId)) {
          await agent.disposeChat(chat.id)
        }
        if (project) {
          terminals.closeByCwd(project.localPath)
        }
        await store.removeProject(command.workspaceId)
        return undefined
      }

      case "independent-workspace.create": {
        const workspace = await store.createIndependentWorkspace(command.name)
        return { workspaceId: workspace.id }
      }

      case "independent-workspace.delete": {
        await store.deleteIndependentWorkspace(command.workspaceId)
        return undefined
      }

      case "independent-workspace.rename": {
        await store.renameIndependentWorkspace(command.workspaceId, command.name)
        return undefined
      }

      case "independent-workspace.set-pinned": {
        await store.setIndependentWorkspacePinned(command.workspaceId, command.pinned)
        return undefined
      }

      case "independent-workspace.reorder": {
        await store.reorderIndependentWorkspaces(command.orderedWorkspaceIds)
        return undefined
      }

      case "system.openExternal": {
        await openExternal(command)
        return undefined
      }

      case "system.readLocalFilePreview":
        return readLocalFilePreview(command.localPath)

      case "chat.create": {
        const chat = await store.createChat(command.workspaceId, command.repoId, command.chatId)
        return { chatId: chat.id }
      }

      case "chat.rename": {
        await store.renameChat(command.chatId, command.title)
        return undefined
      }

      case "chat.delete": {
        await agent.disposeChat(command.chatId)
        await store.deleteChat(command.chatId)
        return undefined
      }

      case "chat.markRead": {
        await store.setChatReadState(command.chatId, false)
        return undefined
      }

      case "chat.send": {
        try {
          return await agent.send(command)
        } catch (e) {
          if (e instanceof RunnerPickRequired) {
            return { needsPick: true, chatId: e.chatId, candidates: e.candidates, reason: e.reason }
          }
          throw e
        }
      }

      case "chat.queue": {
        try {
          return await agent.queue(command)
        } catch (e) {
          if (e instanceof RunnerPickRequired) {
            return { needsPick: true, chatId: e.chatId, candidates: e.candidates, reason: e.reason }
          }
          throw e
        }
      }

      case "chat.selectRunner": {
        await store.setChatRunner(command.chatId, command.runnerId)
        return { ok: true }
      }

      case "chat.cancel": {
        await agent.cancel(command.chatId)
        return undefined
      }

      case "chat.respondTool": {
        await agent.respondTool(command)
        return undefined
      }

      case "chat.generateForkPrompt": {
        const chat = store.getChat(command.chatId)
        if (!chat) {
          throw new Error("Chat not found")
        }
        const project = store.getProject(chat.workspaceId)
        if (!project) {
          throw new Error("Project not found")
        }
        return {
          prompt: await generateForkPrompt(command.intent, await store.getMessages(command.chatId), project.localPath, command.preset),
        }
      }

      case "chat.generateMergePrompt": {
        if (!command.chatIds || command.chatIds.length < 1) {
          throw new Error("At least 1 session is required for merge")
        }
        const firstChat = store.getChat(command.chatIds[0]!)
        if (!firstChat) {
          throw new Error(`Chat not found: ${command.chatIds[0]}`)
        }
        const mergeProject = store.getProject(firstChat.workspaceId)
        if (!mergeProject) {
          throw new Error("Project not found")
        }
        const sessions = await Promise.all(command.chatIds.map(async (chatId) => {
          const chat = store.getChat(chatId)
          if (!chat) {
            throw new Error(`Chat not found: ${chatId}`)
          }
          return { chatId, entries: await store.getMessages(chatId) }
        }))
        return {
          prompt: await generateMergePrompt(command.intent, sessions, mergeProject.localPath, command.preset),
        }
      }

      case "terminal.create": {
        const project = store.getProject(command.workspaceId)
        if (!project) {
          throw new Error("Project not found")
        }
        return terminals.createTerminal({
          workspacePath: project.localPath,
          terminalId: command.terminalId,
          cols: command.cols,
          rows: command.rows,
          scrollback: command.scrollback,
        })
      }

      case "terminal.input": {
        terminals.write(command.terminalId, command.data)
        return undefined
      }

      case "terminal.resize": {
        terminals.resize(command.terminalId, command.cols, command.rows)
        return undefined
      }

      case "terminal.close": {
        terminals.close(command.terminalId)
        return undefined
      }

      case "chat.getMessages": {
        return await store.getMessages(command.chatId, {
          offset: command.offset,
          limit: command.limit,
        })
      }

      case "chat.getRenderUnits": {
        const entries = await store.getMessages(command.chatId, {
          offset: command.offset,
          limit: command.limit,
        })
        return deriveTranscriptRenderUnits(entries, command.isLoading ? "running" : undefined)
      }

      case "chat.getSessionRuntime": {
        const chat = store.getChat(command.chatId)
        if (!chat?.sessionToken || !chat.provider) {
          return { runtime: null }
        }
        const project = store.getProject(chat.workspaceId)
        if (!project) {
          return { runtime: null }
        }
        return {
          runtime: await inspectSessionRuntime(chat.sessionToken, chat.provider, project.localPath),
        }
      }

      case "chat.getRepoStatus": {
        const chat = store.getChat(command.chatId)
        if (!chat) {
          return { repoStatus: null }
        }
        const project = store.getProject(chat.workspaceId)
        if (!project) {
          return { repoStatus: null }
        }
        return {
          repoStatus: await readRepoStatus(project.localPath),
        }
      }

      case "chat.getMessageCount": {
        return {
          messageCount: await store.getMessageCount(command.chatId),
        }
      }

      case "chat.getExternalSessionMessages": {
        const chat = store.getChat(command.parentChatId)
        if (!chat?.provider) {
          return []
        }
        const project = store.getProject(chat.workspaceId)
        if (!project) {
          return []
        }
        return await readSessionTranscript(command.sessionId, chat.provider, project.localPath)
      }

      case "snapshot.subscribe": {
        publisher.addSubscription(command.subscriptionId, command.topic)
        if (command.topic.type === "local-workspaces") {
          await refreshDiscovery()
        }
        return await publisher.getSnapshot(command.topic)
      }

      case "snapshot.unsubscribe": {
        publisher.removeSubscription(command.subscriptionId)
        return undefined
      }

      case "workspace.todo.add": {
        await store.addTodo(command.workspaceId, command.todoId, command.description, command.priority ?? "normal", command.createdBy ?? "user")
        return { ok: true }
      }
      case "workspace.todo.claim": {
        await store.claimTodo(command.workspaceId, command.todoId, command.sessionId)
        return { ok: true }
      }
      case "workspace.todo.complete": {
        await store.completeTodo(command.workspaceId, command.todoId, command.outputs)
        return { ok: true }
      }
      case "workspace.todo.abandon": {
        await store.abandonTodo(command.workspaceId, command.todoId)
        return { ok: true }
      }
      case "workspace.claim.create": {
        await store.createClaim(command.workspaceId, command.claimId, command.intent, command.files, command.sessionId)
        return { ok: true }
      }
      case "workspace.claim.release": {
        await store.releaseClaim(command.workspaceId, command.claimId)
        return { ok: true }
      }
      case "workspace.worktree.create": {
        await store.createWorktree(command.workspaceId, command.worktreeId, command.branch, command.baseBranch ?? "main", "")
        return { ok: true }
      }
      case "workspace.worktree.assign": {
        await store.assignWorktree(command.workspaceId, command.worktreeId, command.sessionId)
        return { ok: true }
      }
      case "workspace.worktree.remove": {
        await store.removeWorktree(command.workspaceId, command.worktreeId)
        return { ok: true }
      }
      case "workspace.rule.set": {
        await store.setRule(command.workspaceId, command.ruleId, command.content, command.setBy)
        return { ok: true }
      }
      case "workspace.rule.remove": {
        await store.removeRule(command.workspaceId, command.ruleId)
        return { ok: true }
      }

      case "workspace.coordination.snapshot": {
        return deriveCoordinationSnapshot(store.state, command.workspaceId)
      }

      case "workspace.agent.save": {
        await store.saveAgentConfig(command.workspaceId, command.config.id, command.config)
        if (args.directoryPolicy) {
          args.directoryPolicy.onAgentConfigSaved(command.workspaceId, command.config.id, command.config).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} agent config save policy error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { ok: true }
      }
      case "workspace.agent.list": {
        return deriveAgentConfigSnapshot(store.state, command.workspaceId)
      }
      case "workspace.agent.get": {
        return store.state.agentConfigsByWorkspace.get(command.workspaceId)?.get(command.agentId) ?? null
      }
      case "workspace.agent.remove": {
        await store.removeAgentConfig(command.workspaceId, command.agentId)
        if (args.directoryPolicy) {
          args.directoryPolicy.onAgentConfigRemoved(command.workspaceId, command.agentId).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} agent config remove policy error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { ok: true }
      }

      case "workspace.repo.add": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const info = await args.repoManager.addLocal(command.localPath)
        const repoId = crypto.randomUUID()
        await store.addRepo(repoId, command.workspaceId, command.localPath, info.origin, command.label ?? null, info.branch)
        return { id: repoId, origin: info.origin, branch: info.branch }
      }

      case "workspace.repo.clone": {
        const repoId = crypto.randomUUID()
        await store.startRepoClone(repoId, command.workspaceId, command.origin, command.targetPath, command.label ?? null)
        if (args.clonePolicy) {
          args.clonePolicy.onRepoCloneStarted(repoId, command.origin, command.targetPath).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} clone policy error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { id: repoId }
      }

      case "workspace.repo.remove": {
        await store.removeRepo(command.repoId, command.workspaceId)
        return { ok: true }
      }

      case "workspace.repo.label": {
        await store.updateRepoLabel(command.repoId, command.label)
        return { ok: true }
      }

      case "workspace.repo.status": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const repo = store.state.reposById.get(command.repoId)
        if (!repo) throw new Error("Repo not found")
        const statusResult = await args.repoManager.status(repo.localPath)
        return statusResult
      }

      case "workspace.repo.pull": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const repo = store.state.reposById.get(command.repoId)
        if (!repo) throw new Error("Repo not found")
        const output = await args.repoManager.pull(repo.localPath, command.branch)
        return { output }
      }

      case "workspace.repo.push": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const repo = store.state.reposById.get(command.repoId)
        if (!repo) throw new Error("Repo not found")
        const output = await args.repoManager.push(repo.localPath, command.branch)
        return { output }
      }

      case "workspace.workflow.run": {
        if (!args.workflowStore || !args.workflowEngine) throw new Error("Workflow engine not available")
        const def = await args.workflowStore.get(command.workflowId)
        if (!def) throw new Error(`Workflow ${command.workflowId} not found`)
        const runId = await args.workflowEngine.start(command.workflowId, command.workspaceId, def, command.triggeredBy ?? "user")
        return { status: "started", runId }
      }

      case "workspace.workflow.cancel": {
        if (!args.workflowEngine) throw new Error("Workflow engine not available")
        await args.workflowEngine.cancel(command.runId, command.workspaceId)
        return { ok: true }
      }

      case "workspace.workflow.list": {
        if (!args.workflowStore) return { workflows: [] }
        const workflows = await args.workflowStore.list()
        return { workflows }
      }

      case "workspace.sandbox.create": {
        if (!args.sandboxManager) throw new Error("Sandbox manager not available")
        const workspace = store.state.workspacesById.get(command.workspaceId)
        if (!workspace) throw new Error(`Workspace ${command.workspaceId} not found`)
        const sandboxId = `sb-${command.workspaceId.slice(0, 12)}-${Date.now()}`
        const limits = command.resourceLimits ?? DEFAULT_RESOURCE_LIMITS
        const repos = [...store.state.reposById.values()].filter(r => r.workspaceId === command.workspaceId)
        const containerId = await args.sandboxManager.create(command.workspaceId, {
          repos: repos.map(r => ({ id: r.id, localPath: r.localPath })),
          limits,
        })
        await store.emitSandboxCreated(sandboxId, command.workspaceId, limits)
        try {
          await args.sandboxManager.start(containerId)
          await store.emitSandboxStarted(sandboxId, containerId, args.sandboxManager.getNatsUrl())
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          await store.emitSandboxError(sandboxId, msg)
          throw err
        }
        return { status: "created", sandboxId, containerId }
      }

      case "workspace.sandbox.start": {
        if (!args.sandboxManager) throw new Error("Sandbox manager not available")
        const sandbox = store.state.sandboxByWorkspace.get(command.workspaceId)
        if (!sandbox?.containerId) throw new Error("No sandbox found for workspace")
        await args.sandboxManager.start(sandbox.containerId)
        await store.emitSandboxStarted(sandbox.id, sandbox.containerId, sandbox.natsUrl)
        return { status: "started" }
      }

      case "workspace.sandbox.stop": {
        if (!args.sandboxManager) throw new Error("Sandbox manager not available")
        const sandbox = store.state.sandboxByWorkspace.get(command.workspaceId)
        if (!sandbox?.containerId) throw new Error("No sandbox found for workspace")
        await args.sandboxManager.stop(sandbox.containerId, command.reason)
        await store.emitSandboxStopped(sandbox.id, command.reason ?? "user_request")
        return { status: "stopped" }
      }

      case "workspace.sandbox.destroy": {
        if (!args.sandboxManager) throw new Error("Sandbox manager not available")
        const sandbox = store.state.sandboxByWorkspace.get(command.workspaceId)
        if (!sandbox?.containerId) throw new Error("No sandbox found for workspace")
        await args.sandboxManager.destroy(sandbox.containerId)
        await store.emitSandboxDestroyed(sandbox.id)
        return { status: "destroyed" }
      }

      case "workspace.sandbox.logs": {
        if (!args.sandboxManager) throw new Error("Sandbox manager not available")
        const sandbox = store.state.sandboxByWorkspace.get(command.workspaceId)
        if (!sandbox?.containerId) throw new Error("No sandbox found for workspace")
        const logs = await args.sandboxManager.logs(sandbox.containerId, command.tail)
        return { logs }
      }

      case "workspace.sandbox.status": {
        if (!args.sandboxManager) throw new Error("Sandbox manager not available")
        const sandbox = store.state.sandboxByWorkspace.get(command.workspaceId)
        if (!sandbox?.containerId) throw new Error("No sandbox found for workspace")
        const inspect = await args.sandboxManager.inspect(sandbox.containerId)
        return { inspect }
      }

      // --- Runtime management ---

      case "runtime.list": {
        if (!args.runtimeRegistry) throw new Error("Runtime registry not available")
        return args.runtimeRegistry.getSnapshot()
      }

      case "runtime.detect": {
        if (!args.runtimeRegistry) throw new Error("Runtime registry not available")
        const detectOpts = DETECT_OPTIONS[command.provider]
        if (!detectOpts) throw new Error(`Unknown provider: ${command.provider}`)
        const result = await args.runtimeRegistry.detectSystemRuntime(command.provider, detectOpts)
        void args.runtimeRegistry.probeCapabilities(command.provider)
        return result
      }

      case "runtime.install": {
        if (!args.runtimeRegistry) throw new Error("Runtime registry not available")
        const installOpts = INSTALL_OPTIONS[command.provider]
        if (!installOpts) throw new Error(`Unknown provider: ${command.provider}`)
        return args.runtimeRegistry.installManaged(command.provider, {
          ...installOpts,
          version: command.version,
        })
      }

      case "runtime.remove": {
        if (!args.runtimeRegistry) throw new Error("Runtime registry not available")
        return args.runtimeRegistry.removeManaged(command.provider, command.version)
      }

      case "runtime.health": {
        if (!args.runtimeRegistry) throw new Error("Runtime registry not available")
        return args.runtimeRegistry.healthCheck(command.provider, command.version)
      }

      // --- Provider profiles ---

      case "profile.list": {
        return {
          profiles: [...store.state.providerProfiles.values()],
        }
      }

      case "profile.save": {
        await store.saveProviderProfile(command.profile.id, command.profile)
        return { ok: true }
      }

      case "profile.remove": {
        await store.removeProviderProfile(command.profileId)
        return { ok: true }
      }

      case "profile.resolve": {
        const record = store.state.providerProfiles.get(command.profileId)
        if (!record) throw new Error(`Profile not found: ${command.profileId}`)
        const override = store.state.workspaceProfileOverrides.get(command.workspaceId)?.get(command.profileId)
        return { profile: resolveProfile(record.profile, override?.overrides) }
      }

      case "workspace.profile.override.set": {
        await store.setWorkspaceProfileOverride(command.workspaceId, command.profileId, command.overrides)
        return { ok: true }
      }

      case "workspace.profile.override.remove": {
        await store.removeWorkspaceProfileOverride(command.workspaceId, command.profileId)
        return { ok: true }
      }

      // --- Extension preferences ---

      case "extension.preference.list": {
        return {
          preferences: [...store.state.extensionPreferences.values()],
        }
      }

      case "extension.preference.set": {
        await store.setExtensionPreference(command.extensionId, command.enabled)
        return { ok: true }
      }

      default: {
        throw new Error("Unknown command type")
      }
    }
  }

  // Process messages in the background
  void (async () => {
    await Promise.all(subs.map(async (sub) => {
      for await (const msg of sub) {
        try {
          await handleMessage(msg)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(LOG_PREFIX, `Unhandled error in command responder: ${message}`)
        }
      }
    }))
  })()

  return {
    dispose() {
      for (const sub of subs) {
        sub.unsubscribe()
      }
    },
  }
}

async function readLocalFilePreview(localPath: string) {
  const resolvedPath = resolveLocalPath(localPath)
  const info = await stat(resolvedPath).catch(() => null)

  if (!info) {
    throw new Error(`Path not found: ${resolvedPath}`)
  }
  if (!info.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath}`)
  }
  if (info.size > MAX_LOCAL_FILE_PREVIEW_BYTES) {
    throw new Error(`File too large to preview: ${resolvedPath}`)
  }

  try {
    return {
      localPath: resolvedPath,
      content: await Bun.file(resolvedPath).text(),
    }
  } catch (error: unknown) {
    throw new Error(`Failed to read file: ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

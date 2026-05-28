import { afterEach, describe, test, expect } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { registerCommandResponders, type RegisterRespondersArgs } from "./nats-responders"
import { commandSubject } from "../shared/nats-subjects"
import { EventStore } from "./event-store"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(data: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(data))
}

function decode<T>(data: Uint8Array): T {
  return JSON.parse(decoder.decode(data)) as T
}

interface CommandResponse {
  ok: boolean
  result?: unknown
  error?: string
}

// --- Mocks ---

function createMockStore() {
  return {
    state: {},
    openProject: async (_path: string, _title?: string) => ({ id: "proj-1" }),
    getProject: (id: string) => (id === "proj-1" ? { id: "proj-1", localPath: "/tmp/test-project" } : null),
    getChat: (id: string) => (id === "chat-1"
      ? { id: "chat-1", workspaceId: "proj-1", provider: "codex", sessionToken: "session-1" }
      : null),
    removeProject: async () => {},
    createChat: async (_workspaceId: string) => ({ id: "chat-1" }),
    renameChat: async () => {},
    deleteChat: async () => {},
    listChatsByProject: () => [{ id: "chat-1" }],
    getMessages: () => [],
    getMessageCount: async () => 0,
  }
}

function createMockAgent() {
  return {
    send: async () => ({ chatId: "chat-1" }),
    queue: async () => ({ chatId: "chat-1", queued: true }),
    cancel: async () => {},
    disposeChat: async () => {},
    respondTool: async () => {},
    getActiveStatuses: () => new Map(),
  }
}

function createMockTerminals() {
  return {
    createTerminal: (opts: { terminalId: string }) => ({
      terminalId: opts.terminalId,
      title: "bash",
      cwd: "/tmp",
      shell: "/bin/bash",
      cols: 80,
      rows: 24,
      scrollback: 1000,
      serializedState: "",
      status: "running",
      exitCode: null,
    }),
    write: () => {},
    resize: () => {},
    close: () => {},
    closeByCwd: () => {},
    getSnapshot: () => null,
    onEvent: () => () => {},
  }
}

function createMockUpdateManager() {
  const snapshot = {
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    status: "available" as const,
    updateAvailable: true,
    lastCheckedAt: Date.now(),
    error: null,
    installAction: "restart" as const,
  }
  return {
    checkForUpdates: async () => snapshot,
    installUpdate: async () => ({ success: true, version: "1.1.0" }),
    getSnapshot: () => snapshot,
    onChange: () => () => {},
  }
}

// --- Test infrastructure ---

let server: NatsServer | null = null
let serverNc: NatsConnection | null = null
let clientNc: NatsConnection | null = null
let disposeFn: (() => void) | null = null
let tempDir: string | null = null

afterEach(async () => {
  disposeFn?.()
  disposeFn = null
  if (clientNc) {
    await clientNc.drain()
    clientNc = null
  }
  if (serverNc) {
    await serverNc.drain()
    serverNc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

async function setup(overrides?: Partial<RegisterRespondersArgs>) {
  server = await NatsServer.start()
  serverNc = await connect({ servers: server.url })
  clientNc = await connect({ servers: server.url })

  const args: RegisterRespondersArgs = {
    nc: serverNc,
    store: createMockStore() as never,
    agent: createMockAgent() as never,
    terminals: createMockTerminals() as never,
    refreshDiscovery: async () => [],
    getDiscoveredProjects: () => [],
    machineDisplayName: "Test Machine",
    updateManager: createMockUpdateManager() as never,
    publisher: {
      addSubscription: () => {},
      removeSubscription: () => {},
      getSnapshot: async () => null,
      broadcastSnapshots: async () => {},
      publishChatMessage: () => {},
      dispose: () => {},
    },
    onStateChange: () => {},
    directoryPolicy: null,
    repoManager: null,
    clonePolicy: null,
    workflowEngine: null,
    workflowStore: null,
    sandboxManager: null,
    runtimeRegistry: null,
    ...overrides,
  }

  const { dispose } = registerCommandResponders(args)
  disposeFn = dispose

  // Allow subscription to propagate
  await serverNc.flush()

  return { clientNc: clientNc!, args }
}

async function sendCommand(nc: NatsConnection, command: unknown): Promise<CommandResponse> {
  const msg = await nc.request(commandSubject((command as { type: string }).type), encode(command), { timeout: 2000 })
  return decode<CommandResponse>(msg.data)
}

// --- Tests ---

describe("nats-responders", () => {
  test("system.ping responds ok", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "system.ping" })
    expect(res.ok).toBe(true)
  })

  test("system.ping does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "system.ping" })
    expect(changed).toBe(false)
  })


  test("system.readLocalFilePreview returns local file content", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kanna-preview-"))
    const filePath = path.join(tempDir, "README.md")
    await writeFile(filePath, "# Preview\n")

    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "system.readLocalFilePreview", localPath: filePath })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({
      localPath: filePath,
      content: "# Preview\n",
    })
  })

  test("system.readLocalFilePreview does not trigger onStateChange", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kanna-preview-"))
    const filePath = path.join(tempDir, "README.md")
    await writeFile(filePath, "# Preview\n")

    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "system.readLocalFilePreview", localPath: filePath })
    expect(changed).toBe(false)
  })

  test("chat.getSessionRuntime returns null when the session file cannot be inspected", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "chat.getSessionRuntime", chatId: "chat-1" })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ runtime: null })
  })

  test("chat.getSessionRuntime does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "chat.getSessionRuntime", chatId: "chat-1" })
    expect(changed).toBe(false)
  })

  test("chat.generateForkPrompt returns a derived prompt from transcript context", async () => {
    const generateCalls: Array<{ intent: string; entries: unknown[]; cwd: string; preset?: string }> = []
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getMessages: () => [
          { kind: "user_prompt", content: "Investigate auth race", _id: "1", createdAt: 1 },
          { kind: "assistant_text", text: "Likely around session restore", _id: "2", createdAt: 2 },
        ],
      } as never,
      generateForkPrompt: async (intent, entries, cwd, preset) => {
        generateCalls.push({ intent, entries, cwd, preset })
        return "## Objective\nFix the auth race"
      },
    })

    const res = await sendCommand(clientNc, {
      type: "chat.generateForkPrompt",
      chatId: "chat-1",
      intent: "Focus on the regression test",
      preset: "tests",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ prompt: "## Objective\nFix the auth race" })
    expect(generateCalls).toEqual([
      {
        intent: "Focus on the regression test",
        entries: [
          { kind: "user_prompt", content: "Investigate auth race", _id: "1", createdAt: 1 },
          { kind: "assistant_text", text: "Likely around session restore", _id: "2", createdAt: 2 },
        ],
        cwd: "/tmp/test-project",
        preset: "tests",
      },
    ])
  })

  test("chat.generateMergePrompt returns a synthesized prompt from multiple sessions", async () => {
    const mergeCalls: Array<{ intent: string; sessions: Array<{ chatId: string; entries: unknown[] }>; cwd: string; preset?: string }> = []
    const multiChatStore = {
      ...createMockStore(),
      getChat: (id: string) => {
        if (id === "chat-1" || id === "chat-2") return { id, workspaceId: "proj-1", provider: "claude", sessionToken: `session-${id}` }
        return null
      },
      getMessages: (chatId: string) => {
        if (chatId === "chat-1") return [{ kind: "user_prompt", content: "Session 1 work", _id: "1", createdAt: 1 }]
        if (chatId === "chat-2") return [{ kind: "assistant_text", text: "Session 2 output", _id: "2", createdAt: 2 }]
        return []
      },
    }

    const { clientNc } = await setup({
      store: multiChatStore as never,
      generateMergePrompt: async (intent, sessions, cwd, preset) => {
        mergeCalls.push({ intent, sessions, cwd, preset })
        return "## Merged\nCombined context from sessions"
      },
    })

    const res = await sendCommand(clientNc, {
      type: "chat.generateMergePrompt",
      chatIds: ["chat-1", "chat-2"],
      intent: "Synthesize findings",
      preset: "synthesis",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ prompt: "## Merged\nCombined context from sessions" })
    expect(mergeCalls).toHaveLength(1)
    expect(mergeCalls[0]!.intent).toBe("Synthesize findings")
    expect(mergeCalls[0]!.sessions).toHaveLength(2)
    expect(mergeCalls[0]!.cwd).toBe("/tmp/test-project")
    expect(mergeCalls[0]!.preset).toBe("synthesis")
  })

  test("chat.generateMergePrompt rejects empty chatIds", async () => {
    const { clientNc } = await setup({
      generateMergePrompt: async () => "should not reach",
    })

    const res = await sendCommand(clientNc, {
      type: "chat.generateMergePrompt",
      chatIds: [],
      intent: "Merge this",
    })

    expect(res.ok).toBe(false)
    expect(res.error).toContain("At least 1 session")
  })

  test("chat.generateMergePrompt does not trigger onStateChange", async () => {
    let changed = false
    const multiChatStore = {
      ...createMockStore(),
      getChat: (id: string) => {
        if (id === "chat-1" || id === "chat-2") return { id, workspaceId: "proj-1", provider: "claude", sessionToken: `session-${id}` }
        return null
      },
    }
    const { clientNc } = await setup({
      store: multiChatStore as never,
      onStateChange: () => { changed = true },
      generateMergePrompt: async () => "merge seed",
    })
    await sendCommand(clientNc, { type: "chat.generateMergePrompt", chatIds: ["chat-1", "chat-2"], intent: "Merge these" })
    expect(changed).toBe(false)
  })

  test("chat.generateForkPrompt does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({
      onStateChange: () => { changed = true },
      generateForkPrompt: async () => "fork seed",
    })
    await sendCommand(clientNc, { type: "chat.generateForkPrompt", chatId: "chat-1", intent: "Fork this work" })
    expect(changed).toBe(false)
  })

  test("chat.getRepoStatus returns repo status for the active project", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kanna-repo-status-"))
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getProject: (id: string) => (id === "proj-1" ? { id: "proj-1", localPath: tempDir! } : null),
      } as never,
    })

    const res = await sendCommand(clientNc, { type: "chat.getRepoStatus", chatId: "chat-1" })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({
      repoStatus: {
        localPath: tempDir,
        branch: null,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        ahead: 0,
        behind: 0,
        isRepo: false,
      },
    })
  })

  test("chat.getRepoStatus does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "chat.getRepoStatus", chatId: "chat-1" })
    expect(changed).toBe(false)
  })


  test("update.check returns snapshot when manager exists", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "update.check" })
    expect(res.ok).toBe(true)
    const result = res.result as { currentVersion: string; updateAvailable: boolean }
    expect(result.currentVersion).toBe("1.0.0")
    expect(result.updateAvailable).toBe(true)
  })

  test("update.check returns fallback when manager is null", async () => {
    const { clientNc } = await setup({ updateManager: null })
    const res = await sendCommand(clientNc, { type: "update.check" })
    expect(res.ok).toBe(true)
    const result = res.result as { currentVersion: string; status: string }
    expect(result.currentVersion).toBe("unknown")
    expect(result.status).toBe("error")
  })

  test("update.check does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "update.check" })
    expect(changed).toBe(false)
  })

  test("update.install returns result", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "update.install" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ success: true, version: "1.1.0" })
  })

  test("update.install errors when manager is null", async () => {
    const { clientNc } = await setup({ updateManager: null })
    const res = await sendCommand(clientNc, { type: "update.install" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Update manager unavailable.")
  })

  test("chat.create returns chatId and triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "chat.create", workspaceId: "proj-1" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ chatId: "chat-1" })
    expect(changed).toBe(true)
  })

  test("chat.create forwards a client-supplied optimistic chatId", async () => {
    let seenWorkspaceId: string | null = null
    let seenChatId: string | null = null
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        createChat: async (workspaceId: string, _repoId?: string, chatId?: string) => {
          seenWorkspaceId = workspaceId
          seenChatId = chatId ?? null
          return { id: chatId ?? "chat-1", workspaceId }
        },
      } as never,
    })

    const res = await sendCommand(clientNc, {
      type: "chat.create",
      workspaceId: "proj-1",
      chatId: "chat-optimistic-1",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ chatId: "chat-optimistic-1" })
    if (seenWorkspaceId === null || seenChatId === null) {
      throw new Error("expected chat.create to forward the optimistic identifiers")
    }
    expect(String(seenWorkspaceId)).toBe("proj-1")
    expect(String(seenChatId)).toBe("chat-optimistic-1")
  })

  test("chat.rename triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "chat.rename", chatId: "chat-1", title: "New Title" })
    expect(res.ok).toBe(true)
    expect(changed).toBe(true)
  })

  test("chat.delete disposes agent runtime state then deletes", async () => {
    const disposed: string[] = []
    const deleted: string[] = []
    const mockAgent = {
      ...createMockAgent(),
      disposeChat: async (id: string) => { disposed.push(id) },
    }
    const mockStore = {
      ...createMockStore(),
      deleteChat: async (id: string) => { deleted.push(id) },
    }
    const { clientNc } = await setup({
      agent: mockAgent as never,
      store: mockStore as never,
    })
    const res = await sendCommand(clientNc, { type: "chat.delete", chatId: "chat-99" })
    expect(res.ok).toBe(true)
    expect(disposed).toEqual(["chat-99"])
    expect(deleted).toEqual(["chat-99"])
  })

  test("chat.send returns agent result", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "chat.send",
      chatId: "chat-1",
      content: "Hello",
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ chatId: "chat-1" })
  })

  test("chat.queue returns agent queue result", async () => {
    const queued: unknown[] = []
    const mockAgent = {
      ...createMockAgent(),
      queue: async (cmd: unknown) => {
        queued.push(cmd)
        return { chatId: "chat-1", queued: true }
      },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, {
      type: "chat.queue",
      chatId: "chat-1",
      content: "Follow-up",
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ chatId: "chat-1", queued: true })
    expect(queued).toEqual([{
      type: "chat.queue",
      chatId: "chat-1",
      content: "Follow-up",
    }])
  })

  test("chat.cancel calls agent.cancel", async () => {
    const cancelled: string[] = []
    const mockAgent = {
      ...createMockAgent(),
      cancel: async (id: string) => { cancelled.push(id) },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, { type: "chat.cancel", chatId: "chat-5" })
    expect(res.ok).toBe(true)
    expect(cancelled).toEqual(["chat-5"])
  })

  test("chat.respondTool calls agent.respondTool", async () => {
    const responses: unknown[] = []
    const mockAgent = {
      ...createMockAgent(),
      respondTool: async (cmd: unknown) => { responses.push(cmd) },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, {
      type: "chat.respondTool",
      chatId: "chat-1",
      toolUseId: "tool-1",
      result: { accepted: true },
    })
    expect(res.ok).toBe(true)
    expect(responses).toHaveLength(1)
  })

  // ── PR5: chat.selectRunner ────────────────────────────────────────────────

  test("chat.selectRunner calls store.setChatRunner and returns ok", async () => {
    const calls: Array<{ chatId: string; runnerId: string | null }> = []
    const mockStore = {
      ...createMockStore(),
      setChatRunner: async (chatId: string, runnerId: string | null) => {
        calls.push({ chatId, runnerId })
      },
    }
    const { clientNc } = await setup({ store: mockStore as never })
    const res = await sendCommand(clientNc, {
      type: "chat.selectRunner",
      chatId: "chat-1",
      runnerId: "runner-abc",
    })
    expect(res.ok).toBe(true)
    expect(calls).toEqual([{ chatId: "chat-1", runnerId: "runner-abc" }])
  })

  test("chat.send maps RunnerPickRequired to needsPick result", async () => {
    const { RunnerPickRequired } = await import("./runner-proxy")
    const mockAgent = {
      ...createMockAgent(),
      send: async () => {
        throw new RunnerPickRequired({
          chatId: "chat-pick",
          candidates: [
            { runnerId: "runner-A", state: "online", capabilities: null, isShared: true, incompatible: false, protocolVersion: 1, lastSeenAt: null, pid: null, ownerId: null },
          ],
          reason: "ambiguous",
        })
      },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, {
      type: "chat.send",
      chatId: "chat-pick",
      content: "Hello",
    })
    // Must be ok:true with needsPick structure (not ok:false)
    expect(res.ok).toBe(true)
    const result = res.result as { needsPick: boolean; chatId: string; candidates: unknown[]; reason: string }
    expect(result.needsPick).toBe(true)
    expect(result.chatId).toBe("chat-pick")
    expect(result.reason).toBe("ambiguous")
    expect(Array.isArray(result.candidates)).toBe(true)
    expect(result.candidates).toHaveLength(1)
  })

  test("chat.queue maps RunnerPickRequired to needsPick result", async () => {
    const { RunnerPickRequired } = await import("./runner-proxy")
    const mockAgent = {
      ...createMockAgent(),
      queue: async () => {
        throw new RunnerPickRequired({
          chatId: "chat-pick",
          candidates: [],
          reason: "sticky_offline",
        })
      },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, {
      type: "chat.queue",
      chatId: "chat-pick",
      content: "Follow-up",
    })
    expect(res.ok).toBe(true)
    const result = res.result as { needsPick: boolean; reason: string }
    expect(result.needsPick).toBe(true)
    expect(result.reason).toBe("sticky_offline")
  })

  test("chat.send still propagates non-RunnerPickRequired errors as ok:false", async () => {
    const mockAgent = {
      ...createMockAgent(),
      send: async () => { throw new Error("runner unavailable") },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, {
      type: "chat.send",
      chatId: "chat-1",
      content: "Hello",
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("runner unavailable")
  })

  // ─────────────────────────────────────────────────────────────────────────

  test("project.open returns workspaceId and triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/test-project" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ workspaceId: "proj-1" })
    expect(changed).toBe(true)
  })

  test("project.create returns workspaceId", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "project.create",
      localPath: "/tmp/test-project",
      title: "Test",
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ workspaceId: "proj-1" })
  })

  test("project.remove disposes chats and triggers onStateChange", async () => {
    let changed = false
    const disposed: string[] = []
    const mockAgent = {
      ...createMockAgent(),
      disposeChat: async (id: string) => { disposed.push(id) },
    }
    const { clientNc } = await setup({
      agent: mockAgent as never,
      onStateChange: () => { changed = true },
    })
    const res = await sendCommand(clientNc, { type: "project.remove", workspaceId: "proj-1" })
    expect(res.ok).toBe(true)
    expect(disposed).toContain("chat-1")
    expect(changed).toBe(true)
  })

  test("terminal.create returns snapshot", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "terminal.create",
      workspaceId: "proj-1",
      terminalId: "term-1",
      cols: 80,
      rows: 24,
      scrollback: 1000,
    })
    expect(res.ok).toBe(true)
    const result = res.result as { terminalId: string }
    expect(result.terminalId).toBe("term-1")
  })

  test("terminal.create errors for missing project", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "terminal.create",
      workspaceId: "nonexistent",
      terminalId: "term-1",
      cols: 80,
      rows: 24,
      scrollback: 1000,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Project not found")
  })

  test("terminal.input does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "terminal.input", terminalId: "term-1", data: "ls\n" })
    expect(res.ok).toBe(true)
    expect(changed).toBe(false)
  })

  test("terminal.resize does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "terminal.resize", terminalId: "term-1", cols: 120, rows: 40 })
    expect(res.ok).toBe(true)
    expect(changed).toBe(false)
  })

  test("terminal.close triggers onStateChange (publishes null snapshot)", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "terminal.close", terminalId: "term-1" })
    expect(res.ok).toBe(true)
    expect(changed).toBe(true)
  })

  test("invalid JSON payload returns error", async () => {
    const { clientNc } = await setup()
    const msg = await clientNc.request(
      commandSubject("system.ping"),
      encoder.encode("not json{{{"),
      { timeout: 2000 },
    )
    const res = decode<CommandResponse>(msg.data)
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Invalid JSON payload")
  })

  test("missing command type returns error", async () => {
    const { clientNc } = await setup()
    const msg = await clientNc.request(
      commandSubject("system.ping"),
      encode({ foo: "bar" }),
      { timeout: 2000 },
    )
    const res = decode<CommandResponse>(msg.data)
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Missing command type")
  })

  test("command handler error returns ok:false with message", async () => {
    const mockStore = {
      ...createMockStore(),
      openProject: async () => { throw new Error("Disk full") },
    }
    const { clientNc } = await setup({ store: mockStore as never })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/fail" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Disk full")
  })

  test("non-Error throw returns stringified message", async () => {
    const mockStore = {
      ...createMockStore(),
      openProject: async () => { throw "string error" },
    }
    const { clientNc } = await setup({ store: mockStore as never })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/fail" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("string error")
  })

  test("dispose unsubscribes from commands", async () => {
    const { clientNc } = await setup()

    // Verify it works before dispose
    const before = await sendCommand(clientNc, { type: "system.ping" })
    expect(before.ok).toBe(true)

    // Dispose and verify requests timeout
    disposeFn?.()
    disposeFn = null

    try {
      await clientNc.request(commandSubject("system.ping"), encode({ type: "system.ping" }), { timeout: 300 })
      expect(true).toBe(false) // should not reach
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  test("multiple commands in sequence", async () => {
    let changeCount = 0
    const { clientNc } = await setup({ onStateChange: () => { changeCount++ } })

    const ping = await sendCommand(clientNc, { type: "system.ping" })
    expect(ping.ok).toBe(true)

    const create = await sendCommand(clientNc, { type: "chat.create", workspaceId: "proj-1" })
    expect(create.ok).toBe(true)

    const read = await sendCommand(clientNc, { type: "update.check" })
    expect(read.ok).toBe(true)

    // Only chat.create should have triggered onStateChange
    expect(changeCount).toBe(1)
  })

  test("snapshot.subscribe registers subscription and returns snapshot", async () => {
    let addCalled = false
    let addedId = ""
    const mockPublisher = {
      addSubscription: (id: string) => { addCalled = true; addedId = id },
      removeSubscription: () => {},
      getSnapshot: async () => ({ mock: "snapshot" }),
      broadcastSnapshots: async () => {},
      publishChatMessage: () => {},
      refreshSessions: async () => {},
      dispose: () => {},
    }
    const { clientNc } = await setup({ publisher: mockPublisher })
    const res = await sendCommand(clientNc, {
      type: "snapshot.subscribe",
      subscriptionId: "sub-1",
      topic: { type: "sidebar" },
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ mock: "snapshot" })
    expect(addCalled).toBe(true)
    expect(addedId).toBe("sub-1")
  })

  test("chat.getMessageCount returns the persisted transcript length", async () => {
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getMessageCount: async (chatId: string) => (chatId === "chat-1" ? 3 : 0),
      } as never,
    })

    const res = await sendCommand(clientNc, {
      type: "chat.getMessageCount",
      chatId: "chat-1",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ messageCount: 3 })
  })

  test("chat.getRenderUnits returns folded transcript render units", async () => {
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getMessages: async () => [
          { _id: "e1", kind: "assistant_text", createdAt: 1, text: "Checking" },
          {
            _id: "e2",
            kind: "tool_call",
            createdAt: 2,
            tool: {
              kind: "tool",
              toolKind: "bash",
              toolName: "Bash",
              toolId: "tool-1",
              input: { command: "pwd" },
            },
          },
          { _id: "e3", kind: "assistant_text", createdAt: 3, text: "Done" },
        ],
      } as never,
    })

    const res = await sendCommand(clientNc, {
      type: "chat.getRenderUnits",
      chatId: "chat-1",
      offset: 0,
      limit: 3,
    })

    expect(res.ok).toBe(true)
    expect((res.result as Array<{ id: string; kind: string }>).map((unit) => [unit.id, unit.kind])).toEqual([
      ["wip:e1:e2", "wip_block"],
      ["assistant_response:e3", "assistant_response"],
    ])
  })

  test("chat.getExternalSessionMessages returns transcript entries for a provider session", async () => {
    const sessionId = `responders-codex-${Date.now()}`
    const codexSessionsDir = path.join(process.env.HOME ?? "", ".codex", "sessions")
    await mkdir(codexSessionsDir, { recursive: true })
    await writeFile(path.join(codexSessionsDir, `${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: "/tmp/test-project" } }),
      JSON.stringify({ timestamp: "2026-04-13T12:00:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "Loaded external transcript" } }),
    ].join("\n") + "\n")

    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "chat.getExternalSessionMessages",
      parentChatId: "chat-1",
      sessionId,
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual([
      expect.objectContaining({ kind: "assistant_text", text: "Loaded external transcript" }),
    ])
  })

  test("snapshot.unsubscribe removes subscription", async () => {
    let removedId = ""
    const mockPublisher = {
      addSubscription: () => {},
      removeSubscription: (id: string) => { removedId = id },
      getSnapshot: async () => null,
      broadcastSnapshots: async () => {},
      publishChatMessage: () => {},
      refreshSessions: async () => {},
      dispose: () => {},
    }
    const { clientNc } = await setup({ publisher: mockPublisher })
    const res = await sendCommand(clientNc, {
      type: "snapshot.unsubscribe",
      subscriptionId: "sub-1",
    })
    expect(res.ok).toBe(true)
    expect(removedId).toBe("sub-1")
  })

  test("snapshot.subscribe does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, {
      type: "snapshot.subscribe",
      subscriptionId: "sub-1",
      topic: { type: "sidebar" },
    })
    expect(changed).toBe(false)
  })

  test("snapshot.subscribe with local-projects triggers refresh", async () => {
    let refreshed = false
    const { clientNc } = await setup({
      refreshDiscovery: async () => { refreshed = true; return [] },
    })
    await sendCommand(clientNc, {
      type: "snapshot.subscribe",
      subscriptionId: "sub-lp",
      topic: { type: "local-workspaces" },
    })
    expect(refreshed).toBe(true)
  })
})

describe("nats-responders runner team (US-RTN)", () => {
  // Uses a real EventStore so the command → store → state round-trip is exercised.
  async function setupWithStore() {
    const dir = await mkdtemp(path.join(tmpdir(), "kanna-rt-resp-"))
    tempDir = dir
    const store = new EventStore(dir)
    await store.initialize()
    let stateChanges = 0
    const { clientNc } = await setup({
      store: store as never,
      onStateChange: () => { stateChanges += 1 },
    })
    return { clientNc, store, stateChanges: () => stateChanges }
  }

  test("team.member.save persists and team.member.list returns it", async () => {
    const { clientNc, store } = await setupWithStore()
    const save = await sendCommand(clientNc, { type: "team.member.save", member: { id: "m1", name: "Alice" } })
    expect(save.ok).toBe(true)
    expect(store.state.teamMembers.get("m1")?.name).toBe("Alice")

    const list = await sendCommand(clientNc, { type: "team.member.list" })
    expect(list.ok).toBe(true)
    expect((list.result as { members: { id: string; name: string }[] }).members).toEqual([{ id: "m1", name: "Alice" }])
  })

  test("runner.label.set persists name + assignment and triggers a state change", async () => {
    const { clientNc, store, stateChanges } = await setupWithStore()
    const before = stateChanges()
    const res = await sendCommand(clientNc, { type: "runner.label.set", runnerId: "runner-1", name: "Studio Mac", memberId: "m1" })
    expect(res.ok).toBe(true)
    expect(store.state.runnerLabels.get("runner-1")?.name).toBe("Studio Mac")
    expect(store.state.runnerLabels.get("runner-1")?.memberId).toBe("m1")
    // Mutating command must republish snapshots.
    expect(stateChanges()).toBe(before + 1)
  })

  test("team.member.remove unassigns runners", async () => {
    const { clientNc, store } = await setupWithStore()
    await sendCommand(clientNc, { type: "team.member.save", member: { id: "m1", name: "Alice" } })
    await sendCommand(clientNc, { type: "runner.label.set", runnerId: "runner-1", name: "Box", memberId: "m1" })
    await sendCommand(clientNc, { type: "team.member.remove", memberId: "m1" })
    expect(store.state.teamMembers.get("m1")).toBeUndefined()
    expect(store.state.runnerLabels.get("runner-1")?.memberId).toBeNull()
  })

  test("team.member.list is non-mutating (no state change)", async () => {
    const { clientNc, stateChanges } = await setupWithStore()
    const before = stateChanges()
    await sendCommand(clientNc, { type: "team.member.list" })
    expect(stateChanges()).toBe(before)
  })
})

import { describe, expect, test } from "bun:test"
import { SessionIndex } from "./session-index"
import type { TranscriptEntry, ToolCallEntry, NormalizedToolCall } from "../shared/types"
import type { StoreState, ChatRecord } from "./events"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

function toolCallEntry(tool: NormalizedToolCall): Omit<ToolCallEntry, "_id" | "createdAt"> {
  return { kind: "tool_call", tool }
}

function createState(chats: ChatRecord[]): StoreState {
  const chatsById = new Map<string, ChatRecord>()
  const workspacesById = new Map<string, { id: string; localPath: string; title: string; createdAt: number; updatedAt: number }>()
  const workspaceIdsByPath = new Map<string, string>()

  workspacesById.set("p1", { id: "p1", localPath: "/tmp/p", title: "Test", createdAt: 0, updatedAt: 0 })
  workspacesById.set("p2", { id: "p2", localPath: "/tmp/p2", title: "Test2", createdAt: 0, updatedAt: 0 })
  for (const chat of chats) {
    chatsById.set(chat.id, chat)
  }
  return { workspacesById, workspaceIdsByPath, independentWorkspacesById: new Map(), chatsById, queuedTurnsByChat: new Map(), coordinationByWorkspace: new Map(), agentConfigsByWorkspace: new Map(), reposById: new Map(), reposByPath: new Map(), workflowRunsByWorkspace: new Map(), sandboxByWorkspace: new Map(), providerProfiles: new Map(), workspaceProfileOverrides: new Map(), extensionPreferences: new Map(), teamMembers: new Map(), runnerLabels: new Map() }
}

function makeChat(id: string, workspaceId = "p1", provider: "claude" | "codex" | null = "claude"): ChatRecord {
  return {
    id,
    workspaceId,
    repoId: null,
    title: "Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    unread: false,
    provider,
    planMode: false,
    sessionToken: null,
    lastTurnOutcome: null,
  }
}

describe("SessionIndex", () => {
  test("returns empty for project with no chats", () => {
    const index = new SessionIndex()
    const sessions = index.getSessionsByProject("p1")
    expect(sessions).toEqual([])
  })

  test("tracks session after message append", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])
    const entry = timestamped({ kind: "user_prompt", content: "implement auth middleware" })
    index.onMessageAppended("c1", entry, state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions.length).toBe(1)
    expect(sessions[0].chatId).toBe("c1")
    expect(sessions[0].intent).toBe("implement auth middleware")
    expect(sessions[0].provider).toBe("claude")
  })

  test("derives intent from first user message only", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "first message" }), state)
    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "second message" }), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].intent).toBe("first message")
  })

  test("accumulates filesTouched from tool calls", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "edit files" }), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "edit_file",
      toolName: "EditFile",
      toolId: crypto.randomUUID(),
      input: { filePath: "/src/auth.ts", oldString: "a", newString: "b" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "read_file",
      toolName: "ReadFile",
      toolId: crypto.randomUUID(),
      input: { filePath: "/src/utils.ts" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].filesTouched).toContain("/src/auth.ts")
    expect(sessions[0].filesTouched).toContain("/src/utils.ts")
  })

  test("accumulates commandsRun from bash tool calls", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "run stuff" }), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "bash",
      toolName: "Bash",
      toolId: crypto.randomUUID(),
      input: { command: "bun test" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].commandsRun).toContain("bun test")
  })

  test("updates lastActivity on every message", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "hello" }), state)
    const first = index.getSessionsByProject("p1")[0].lastActivity

    index.onMessageAppended("c1", timestamped({ kind: "assistant_text", text: "hi" }), state)
    const second = index.getSessionsByProject("p1")[0].lastActivity

    expect(second >= first).toBe(true)
  })

  test("getSession returns single session detail", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])
    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "task" }), state)

    const session = index.getSession("c1")
    expect(session).not.toBeNull()
    expect(session!.chatId).toBe("c1")
  })

  test("getSession returns null for unknown chat", () => {
    const index = new SessionIndex()
    expect(index.getSession("unknown")).toBeNull()
  })

  test("isolates sessions by project", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1", "p1"), makeChat("c2", "p2")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "p1 work" }), state)
    index.onMessageAppended("c2", timestamped({ kind: "user_prompt", content: "p2 work" }), state)

    expect(index.getSessionsByProject("p1").length).toBe(1)
    expect(index.getSessionsByProject("p2").length).toBe(1)
    expect(index.getSessionsByProject("p1")[0].intent).toBe("p1 work")
  })

  test("deduplicates filesTouched", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "edit" }), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "edit_file",
      toolName: "EditFile",
      toolId: crypto.randomUUID(),
      input: { filePath: "/src/auth.ts", oldString: "a", newString: "b" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "write_file",
      toolName: "WriteFile",
      toolId: crypto.randomUUID(),
      input: { filePath: "/src/auth.ts", content: "new content" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

    const sessions = index.getSessionsByProject("p1")
    const authCount = sessions[0].filesTouched.filter((f) => f === "/src/auth.ts").length
    expect(authCount).toBe(1)
  })

  test("tracks glob and grep tool calls via pattern paths", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "search" }), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "bash",
      toolName: "Bash",
      toolId: crypto.randomUUID(),
      input: { command: "git status" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)
    index.onMessageAppended("c1", timestamped(toolCallEntry({
      kind: "tool",
      toolKind: "bash",
      toolName: "Bash",
      toolId: crypto.randomUUID(),
      input: { command: "bun test" },
    }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].commandsRun).toEqual(["git status", "bun test"])
  })

  test("sets status to complete on success result", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "do stuff" }), state)
    index.onMessageAppended("c1", timestamped({
      kind: "result",
      subtype: "success",
      isError: false,
      durationMs: 100,
      result: "done",
    }), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].status).toBe("complete")
  })

  test("sets status to failed on error result", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "do stuff" }), state)
    index.onMessageAppended("c1", timestamped({
      kind: "result",
      subtype: "error",
      isError: true,
      durationMs: 100,
      result: "failed",
    }), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].status).toBe("failed")
  })

  test("defaults provider to claude when chat has null provider", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1", "p1", null)])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "hello" }), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].provider).toBe("claude")
  })

  describe("branch detection", () => {
    test("detects branch from git checkout <branch>", () => {
      const index = new SessionIndex()
      const state = createState([makeChat("c1")])

      index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "switch branch" }), state)
      index.onMessageAppended("c1", timestamped(toolCallEntry({
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: crypto.randomUUID(),
        input: { command: "git checkout feat/auth" },
      }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

      expect(index.getSession("c1")!.branch).toBe("feat/auth")
    })

    test("detects branch from git checkout -b <branch>", () => {
      const index = new SessionIndex()
      const state = createState([makeChat("c1")])

      index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "new branch" }), state)
      index.onMessageAppended("c1", timestamped(toolCallEntry({
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: crypto.randomUUID(),
        input: { command: "git checkout -b feat/new" },
      }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

      expect(index.getSession("c1")!.branch).toBe("feat/new")
    })

    test("detects branch from git switch <branch>", () => {
      const index = new SessionIndex()
      const state = createState([makeChat("c1")])

      index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "switch" }), state)
      index.onMessageAppended("c1", timestamped(toolCallEntry({
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: crypto.randomUUID(),
        input: { command: "git switch feat/auth" },
      }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

      expect(index.getSession("c1")!.branch).toBe("feat/auth")
    })

    test("detects branch from git switch -c <branch>", () => {
      const index = new SessionIndex()
      const state = createState([makeChat("c1")])

      index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "create branch" }), state)
      index.onMessageAppended("c1", timestamped(toolCallEntry({
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: crypto.randomUUID(),
        input: { command: "git switch -c feat/new" },
      }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

      expect(index.getSession("c1")!.branch).toBe("feat/new")
    })

    test("last branch switch wins", () => {
      const index = new SessionIndex()
      const state = createState([makeChat("c1")])

      index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "work" }), state)
      index.onMessageAppended("c1", timestamped(toolCallEntry({
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: crypto.randomUUID(),
        input: { command: "git checkout feat/first" },
      }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)
      index.onMessageAppended("c1", timestamped(toolCallEntry({
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: crypto.randomUUID(),
        input: { command: "git switch feat/second" },
      }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)

      expect(index.getSession("c1")!.branch).toBe("feat/second")
    })
  })

  describe("commandsRun cap", () => {
    test("caps commandsRun, keeping most recent", () => {
      const index = new SessionIndex()
      const state = createState([makeChat("c1")])

      index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "work" }), state)

      for (let i = 0; i < 250; i++) {
        index.onMessageAppended("c1", timestamped(toolCallEntry({
          kind: "tool",
          toolKind: "bash",
          toolName: "Bash",
          toolId: crypto.randomUUID(),
          input: { command: `cmd-${i}` },
        }) as Omit<TranscriptEntry, "_id" | "createdAt">), state)
      }

      const session = index.getSession("c1")!
      expect(session.commandsRun.length).toBeLessThanOrEqual(210)
      expect(session.commandsRun.at(-1)).toBe("cmd-249")
    })
  })
})

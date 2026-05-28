import { describe, test, expect, afterEach, beforeEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream"
import { RunnerAgent, type TurnFactory } from "./runner-agent"
import {
  runnerEventsSubject,
  RUNNER_EVENTS_STREAM,
  ALL_RUNNER_EVENTS,
  type RunnerTurnEvent,
  type StartTurnCommand,
} from "../shared/runner-protocol"
import type { HarnessEvent, HarnessTurn } from "../shared/harness-types"
import type { TranscriptEntry } from "../shared/types"

// ── Helpers ─────────────────────────────────────────────────────────

function ts<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

function createMockTurn(events: HarnessEvent[]): HarnessTurn {
  let interrupted = false
  let closed = false
  const stream = (async function* () {
    for (const event of events) {
      if (interrupted) return
      yield event
    }
  })()
  return {
    provider: "claude",
    stream,
    interrupt: async () => { interrupted = true },
    close: () => { closed = true },
  }
}

// startTurn now fails fast if the workspace dir doesn't exist on the runner, so the
// fixture must point at a real directory.
const TEST_WORKSPACE = mkdtempSync(join(tmpdir(), "runner-agent-ws-"))

function makeCmd(overrides?: Partial<StartTurnCommand>): StartTurnCommand {
  return {
    chatId: "chat-1",
    provider: "claude",
    content: "hello",
    model: "test-model",
    planMode: false,
    appendUserPrompt: true,
    workspaceLocalPath: TEST_WORKSPACE,
    sessionToken: null,
    chatTitle: "New Chat",
    existingMessageCount: 0,
    workspaceId: "p1",
    ...overrides,
  }
}

/** Subscribe to runner events for a chat and collect into an array. */
function collectEvents(nc: NatsConnection, chatId: string): RunnerTurnEvent[] {
  const events: RunnerTurnEvent[] = []
  const sub = nc.subscribe(runnerEventsSubject(chatId))
  void (async () => {
    const decoder = new TextDecoder()
    for await (const msg of sub) {
      events.push(JSON.parse(decoder.decode(msg.data)) as RunnerTurnEvent)
    }
  })()
  return events
}

async function ensureStream(nc: NatsConnection) {
  const jsm = await jetstreamManager(nc)
  await jsm.streams.add({
    name: RUNNER_EVENTS_STREAM,
    subjects: [ALL_RUNNER_EVENTS],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_age: 5 * 60 * 1_000_000_000,
    max_msgs: 10_000,
    max_bytes: 64 * 1024 * 1024,
  })
}

// ── Tests ───────────────────────────────────────────────────────────

describe("RunnerAgent", () => {
  let server: NatsServer
  let nc: NatsConnection
  let tmpDir: string | null = null

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-test-"))
    server = await NatsServer.start({ jetstream: true, storeDir: tmpDir })
    nc = await connect({ servers: server.url })
    await ensureStream(nc)
  })

  afterEach(async () => {
    await nc?.drain()
    await server?.stop()
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("startTurn publishes user_prompt, transcript, and turn_finished events", async () => {
    const harnessEvents: HarnessEvent[] = [
      { type: "transcript", entry: ts({ kind: "system_init", provider: "claude", model: "test", tools: [], agents: [], slashCommands: [], mcpServers: [] }) },
      { type: "transcript", entry: ts({ kind: "assistant_text", text: "Hello world" }) },
      { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 100, result: "done" }) },
    ]

    const turnFactory: TurnFactory = async () => createMockTurn(harnessEvents)
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd())
    // Wait for async turn processing
    await new Promise((r) => setTimeout(r, 300))

    const types = collected.map((e) => e.type)

    // Must have user_prompt as a transcript event
    const transcripts = collected.filter((e) => e.type === "transcript") as Array<RunnerTurnEvent & { type: "transcript" }>
    const kinds = transcripts.map((e) => (e as any).entry?.kind)
    expect(kinds).toContain("user_prompt")
    expect(kinds).toContain("system_init")
    expect(kinds).toContain("assistant_text")
    expect(kinds).toContain("result")

    // Must end with turn_finished
    expect(types).toContain("turn_finished")
  })

  test("startTurn fails fast (not a hang) when the workspace dir is missing on this runner", async () => {
    let factoryCalled = false
    const turnFactory: TurnFactory = async () => { factoryCalled = true; return createMockTurn([]) }
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })

    await expect(
      agent.startTurn(makeCmd({ workspaceLocalPath: "/no/such/workspace-xyz-12345" })),
    ).rejects.toThrow(/does not exist on this runner/i)
    // It must reject BEFORE invoking the turn factory (which would spawn the agent
    // into a nonexistent cwd and hang — the original bug).
    expect(factoryCalled).toBe(false)
  })

  test("startTurn without appendUserPrompt skips user_prompt", async () => {
    const harnessEvents: HarnessEvent[] = [
      { type: "transcript", entry: ts({ kind: "assistant_text", text: "follow-up" }) },
      { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 50, result: "ok" }) },
    ]

    const turnFactory: TurnFactory = async () => createMockTurn(harnessEvents)
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd({ appendUserPrompt: false }))
    await new Promise((r) => setTimeout(r, 300))

    const transcripts = collected.filter((e) => e.type === "transcript") as any[]
    const kinds = transcripts.map((e) => e.entry?.kind)
    expect(kinds).not.toContain("user_prompt")
  })

  test("delegatedContext is prepended for the harness without rewriting the visible user prompt", async () => {
    let capturedContent = ""
    const turnFactory: TurnFactory = async (args) => {
      capturedContent = args.content
      return createMockTurn([
        { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) },
      ])
    }
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd({
      content: "Write the regression test",
      delegatedContext: "Forked parent chat context:\nUser: Investigate the auth race condition",
      isSpawned: true,
    }))
    await new Promise((r) => setTimeout(r, 300))

    expect(capturedContent).toBe(
      "Forked parent chat context:\nUser: Investigate the auth race condition\n\nNew task:\nWrite the regression test",
    )

    const transcripts = collected.filter((event) => event.type === "transcript") as Array<RunnerTurnEvent & { type: "transcript" }>
    const userPrompt = transcripts.find((event) => event.entry.kind === "user_prompt")
    expect(userPrompt?.entry.kind).toBe("user_prompt")
    expect(userPrompt && "content" in userPrompt.entry ? userPrompt.entry.content : undefined).toBe("Write the regression test")
  })

  test("session_token events are published", async () => {
    const harnessEvents: HarnessEvent[] = [
      { type: "session_token", sessionToken: "session-abc" },
      { type: "transcript", entry: ts({ kind: "assistant_text", text: "hi" }) },
      { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) },
    ]

    const turnFactory: TurnFactory = async () => createMockTurn(harnessEvents)
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 300))

    const sessionTokenEvents = collected.filter((e) => e.type === "session_token")
    expect(sessionTokenEvents).toHaveLength(1)
    expect((sessionTokenEvents[0] as any).sessionToken).toBe("session-abc")
  })

  test("cancel publishes interrupted + turn_cancelled", async () => {
    // Turn that hangs forever (never yields result)
    let interrupted = false
    const turn: HarnessTurn = {
      provider: "claude",
      stream: (async function* () {
        yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
        // Block indefinitely until interrupted
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (interrupted) { clearInterval(check); resolve() }
          }, 10)
        })
      })(),
      interrupt: async () => { interrupted = true },
      close: () => {},
    }

    const turnFactory: TurnFactory = async () => turn
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 100))

    await agent.cancel("chat-1")
    await new Promise((r) => setTimeout(r, 300))

    const types = collected.map((e) => e.type)
    expect(types).toContain("turn_cancelled")

    // Check that interrupted entry was published as transcript
    const transcripts = collected.filter((e) => e.type === "transcript") as any[]
    const kinds = transcripts.map((e) => e.entry?.kind)
    expect(kinds).toContain("interrupted")
  })

  test("cancel returns promptly and suppresses late stream events after cancellation", async () => {
    let releaseLateEvent: (() => void) | null = null
    let closed = false
    const turn: HarnessTurn = {
      provider: "claude",
      stream: (async function* () {
        await new Promise<void>((resolve) => { releaseLateEvent = resolve })
        yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
        yield { type: "transcript" as const, entry: ts({ kind: "assistant_text", text: "late text" }) }
      })(),
      interrupt: async () => {
        await new Promise<void>(() => {})
      },
      close: () => { closed = true },
    }

    const turnFactory: TurnFactory = async () => turn
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 50))

    const cancelResult = await Promise.race([
      agent.cancel("chat-1").then(() => "cancelled" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ])

    expect(cancelResult).toBe("cancelled")
    releaseLateEvent?.()
    await new Promise((r) => setTimeout(r, 150))

    const cancelledIndex = collected.findIndex((event) => event.type === "turn_cancelled")
    expect(cancelledIndex).toBeGreaterThanOrEqual(0)
    const afterCancel = collected.slice(cancelledIndex + 1)
    expect(afterCancel.some((event) => event.type === "status_change" && event.status === "running")).toBe(false)
    expect(afterCancel.some((event) => event.type === "transcript" && event.entry?.kind === "assistant_text")).toBe(false)
    expect(closed).toBe(true)
  })

  test("turn error publishes turn_failed", async () => {
    const turn: HarnessTurn = {
      provider: "claude",
      stream: (async function* () {
        yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
        throw new Error("SDK crashed")
      })(),
      interrupt: async () => {},
      close: () => {},
    }

    const turnFactory: TurnFactory = async () => turn
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 300))

    const failed = collected.filter((e) => e.type === "turn_failed")
    expect(failed).toHaveLength(1)
    expect((failed[0] as any).error).toBe("SDK crashed")
  })

  test("status changes to running on system_init", async () => {
    const harnessEvents: HarnessEvent[] = [
      { type: "transcript", entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) },
      { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) },
    ]

    const turnFactory: TurnFactory = async () => createMockTurn(harnessEvents)
    const agent = new RunnerAgent({ nc, createTurn: turnFactory })
    const collected = collectEvents(nc, "chat-1")

    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 300))

    const statusEvents = collected.filter((e) => e.type === "status_change") as any[]
    const statuses = statusEvents.map((e) => e.status)
    expect(statuses).toContain("starting")
    expect(statuses).toContain("running")
  })

  test("title generation publishes title_generated", async () => {
    const harnessEvents: HarnessEvent[] = [
      { type: "transcript", entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) },
      { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) },
    ]

    const turnFactory: TurnFactory = async () => createMockTurn(harnessEvents)
    const agent = new RunnerAgent({
      nc,
      createTurn: turnFactory,
      generateTitle: async () => "Test Title",
    })
    const collected = collectEvents(nc, "chat-1")

    // New chat with no messages → should trigger title generation
    await agent.startTurn(makeCmd({ chatTitle: "New Chat", existingMessageCount: 0, appendUserPrompt: true }))
    await new Promise((r) => setTimeout(r, 500))

    const titleEvents = collected.filter((e) => e.type === "title_generated")
    expect(titleEvents).toHaveLength(1)
    expect((titleEvents[0] as any).title).toBe("Test Title")
  })

  test("getActiveStatuses reflects turn state", async () => {
    // Turn that blocks
    let unblock: (() => void) | null = null
    const turn: HarnessTurn = {
      provider: "claude",
      stream: (async function* () {
        yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
        await new Promise<void>((r) => { unblock = r })
        yield { type: "transcript" as const, entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) }
      })(),
      interrupt: async () => { unblock?.() },
      close: () => {},
    }

    const agent = new RunnerAgent({ nc, createTurn: async () => turn })

    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 100))

    const statuses = agent.getActiveStatuses()
    expect(statuses.get("chat-1")).toBeDefined()

    // Unblock and let it finish
    unblock?.()
    await new Promise((r) => setTimeout(r, 300))

    const finalStatuses = agent.getActiveStatuses()
    expect(finalStatuses.has("chat-1")).toBe(false)
  })

  test("follow-up turn runs before close() is called on the original turn", async () => {
    let followUpStarted = false
    let closeCalledBeforeFollowUp = false
    let turnIndex = 0

    const createTurn: TurnFactory = async (args) => {
      turnIndex++
      if (turnIndex === 1) {
        // First turn: sends exit_plan_mode tool request via onToolRequest, then completes
        return {
          provider: "codex",
          stream: (async function* () {
            yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "codex", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
            // Trigger exit_plan_mode tool request through the harness callback
            await args.onToolRequest({
              tool: { toolId: "exit-plan", toolKind: "exit_plan_mode" as const, input: {} } as any,
            })
            yield { type: "transcript" as const, entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) }
          })(),
          interrupt: async () => {},
          close: () => {
            if (!followUpStarted) {
              closeCalledBeforeFollowUp = true
            }
          },
        }
      }
      // Follow-up turn (turnIndex === 2)
      followUpStarted = true
      return createMockTurn([
        { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "follow-up done" }) },
      ])
    }

    const agent = new RunnerAgent({ nc, createTurn })
    await agent.startTurn(makeCmd({ provider: "codex", planMode: true }))
    await new Promise((r) => setTimeout(r, 200))

    // Respond to the exit_plan_mode tool with confirmed=true to trigger follow-up
    await agent.respondTool("chat-1", "exit-plan", { confirmed: true })
    await new Promise((r) => setTimeout(r, 500))

    // With current code (close before follow-up), closeCalledBeforeFollowUp is true.
    // After the fix, it should be false.
    expect(closeCalledBeforeFollowUp).toBe(false)
    expect(followUpStarted).toBe(true)
  })

  test("passes coordinationStore to createTurn when provided", async () => {
    const mockStore = {
      state: { coordinationByWorkspace: new Map() },
      addTodo: async () => {},
      claimTodo: async () => {},
      completeTodo: async () => {},
      abandonTodo: async () => {},
      createClaim: async () => {},
      releaseClaim: async () => {},
      createWorktree: async () => {},
      assignWorktree: async () => {},
      removeWorktree: async () => {},
      setRule: async () => {},
      removeRule: async () => {},
    }

    let capturedStore: unknown
    const createTurn: TurnFactory = async (args) => {
      capturedStore = args.store
      return createMockTurn([
        { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "done" }) },
      ])
    }

    const agent = new RunnerAgent({ nc, createTurn, coordinationStore: mockStore })
    await agent.startTurn(makeCmd())
    await new Promise((r) => setTimeout(r, 200))

    expect(capturedStore).toBe(mockStore)
  })
})

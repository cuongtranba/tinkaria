import { afterEach, describe, test, expect } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { RunnerProxy, type RunnerProxyOptions } from "./runner-proxy"
import type { SessionStatus } from "../shared/types"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const RUNNER_ID = "test-runner-1"

function createMockRunner(nc: NatsConnection, runnerId: string) {
  const received: unknown[] = []
  const sub = nc.subscribe(`runtime.runner.cmd.${runnerId}.>`)
  void (async () => {
    for await (const msg of sub) {
      received.push({
        subject: msg.subject,
        data: JSON.parse(decoder.decode(msg.data)),
      })
      msg.respond(encoder.encode(JSON.stringify({ ok: true })))
    }
  })()
  return { received, dispose: () => sub.unsubscribe() }
}

function createMockStore() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const queuedTurns = new Map<string, {
    chatId: string
    provider?: "claude" | "codex"
    content: string
    model?: string
    modelOptions?: unknown
    effort?: string
    planMode?: boolean
    updatedAt: number
  }>()
  const store = {
    requireChat: (chatId: string) => ({
      id: chatId,
      workspaceId: "p1",
      repoId: null,
      title: "Test Chat",
      provider: "claude" as const,
      model: "sonnet" as string | null,
      sessionToken: null,
      planMode: false,
    }),
    getProject: (_workspaceId: string) => ({
      id: "p1",
      localPath: "/tmp/test-project",
      title: "Test Project",
    }),
    getMessages: (_chatId: string) => [],
    createChat: async (_workspaceId: string) => ({
      id: "new-chat-id",
      workspaceId: _workspaceId,
    repoId: null,
      title: "New Chat",
      provider: null,
      sessionToken: null,
      planMode: false,
    }),
    setChatProvider: async (chatId: string, provider: string) => {
      calls.push({ method: "setChatProvider", args: [chatId, provider] })
    },
    setChatModel: async (chatId: string, model: string | null) => {
      calls.push({ method: "setChatModel", args: [chatId, model] })
    },
    setPlanMode: async (chatId: string, planMode: boolean) => {
      calls.push({ method: "setPlanMode", args: [chatId, planMode] })
    },
    setSessionToken: async (chatId: string, token: string | null) => {
      calls.push({ method: "setSessionToken", args: [chatId, token] })
    },
    enqueueQueuedTurn: async (args: {
      chatId: string
      provider?: "claude" | "codex"
      content: string
      model?: string
      modelOptions?: unknown
      effort?: string
      planMode?: boolean
    }) => {
      calls.push({ method: "enqueueQueuedTurn", args: [args] })
      const existing = queuedTurns.get(args.chatId)
      const current = existing?.content.trim() ?? ""
      const next = args.content.trim()
      const content = current && next ? `${current}\n\n${next}` : next || current
      queuedTurns.set(args.chatId, {
        chatId: args.chatId,
        provider: args.provider ?? existing?.provider,
        content,
        model: args.model ?? existing?.model,
        modelOptions: args.modelOptions ?? existing?.modelOptions,
        effort: args.effort ?? existing?.effort,
        planMode: args.planMode ?? existing?.planMode,
        updatedAt: Date.now(),
      })
    },
    getQueuedTurn: (chatId: string) => {
      const queued = queuedTurns.get(chatId)
      return queued ? { ...queued } : null
    },
    clearQueuedTurn: async (chatId: string) => {
      calls.push({ method: "clearQueuedTurn", args: [chatId] })
      queuedTurns.delete(chatId)
    },
    state: {
      providerProfiles: new Map(),
      workspaceProfileOverrides: new Map(),
    },
    _calls: calls,
  } as unknown as RunnerProxyOptions["store"] & { _calls: typeof calls }
  return store
}

describe("RunnerProxy", () => {
  let natsServer: NatsServer | null = null
  let clientNc: NatsConnection | null = null
  let runnerNc: NatsConnection | null = null
  let proxy: RunnerProxy | null = null
  let mockRunner: ReturnType<typeof createMockRunner> | null = null

  afterEach(async () => {
    mockRunner?.dispose()
    mockRunner = null
    proxy = null
    if (clientNc && !clientNc.isClosed()) await clientNc.drain()
    clientNc = null
    if (runnerNc && !runnerNc.isClosed()) await runnerNc.drain()
    runnerNc = null
    if (natsServer) await natsServer.stop()
    natsServer = null
  })

  async function setup(overrides?: Partial<RunnerProxyOptions>) {
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })

    mockRunner = createMockRunner(runnerNc, RUNNER_ID)
    await runnerNc.flush()

    const activeStatuses = new Map<string, SessionStatus>()
    const store = createMockStore()

    proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: RUNNER_ID,
      getActiveStatuses: () => activeStatuses,
      // PR3 made the start_turn gate fail-closed: a RunnerProxy without a
      // readiness source refuses start_turn. Provide a compatible default so
      // these baseline tests exercise the happy path (incompatibility is covered
      // in runner-incompatible-gate.test.ts).
      getRunnerReadiness: () => ({ incompatible: false, protocolVersion: 1 }),
      ...overrides,
    })

    return { activeStatuses, store }
  }

  test("send() with existing chatId forwards StartTurnCommand and persists model", async () => {
    const { store } = await setup()

    await proxy!.send({
      type: "chat.send",
      chatId: "chat-123",
      content: "Hello agent",
      model: "sonnet",
    })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.start_turn`)
    expect(msg.data).toMatchObject({
      chatId: "chat-123",
      provider: "claude",
      content: "Hello agent",
      model: "sonnet",
      workspaceLocalPath: "/tmp/test-project",
      appendUserPrompt: true,
    })

    const modelCall = store._calls.find((c) => c.method === "setChatModel")
    expect(modelCall).toEqual({ method: "setChatModel", args: ["chat-123", "sonnet"] })
  })

  test("send() without chatId creates chat first", async () => {
    await setup()

    const result = await proxy!.send({
      type: "chat.send",
      workspaceId: "p1",
      content: "New conversation",
    })

    expect(result.chatId).toBe("new-chat-id")
    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.data).toMatchObject({
      chatId: "new-chat-id",
      content: "New conversation",
    })
  })

  test("send() without chatId or workspaceId throws", async () => {
    await setup()

    await expect(
      proxy!.send({
        type: "chat.send",
        content: "No context",
      }),
    ).rejects.toThrow("Missing workspaceId")
  })

  test("queue() holds follow-up while active and drainQueuedTurn starts it after the turn ends", async () => {
    const { activeStatuses } = await setup()
    activeStatuses.set("chat-queued", "running")

    await expect(proxy!.queue({
      type: "chat.queue",
      chatId: "chat-queued",
      content: "First follow-up",
      model: "sonnet",
    })).resolves.toEqual({ chatId: "chat-queued", queued: true })

    await proxy!.queue({
      type: "chat.queue",
      chatId: "chat-queued",
      content: "Second follow-up",
      model: "opus",
      planMode: true,
    })

    expect(mockRunner!.received).toHaveLength(0)

    activeStatuses.delete("chat-queued")
    await expect(proxy!.drainQueuedTurn("chat-queued")).resolves.toBe(true)

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.start_turn`)
    expect(msg.data).toMatchObject({
      chatId: "chat-queued",
      content: "First follow-up\n\nSecond follow-up",
      model: "opus",
      planMode: true,
    })
  })

  test("queue() sends immediately when the chat is already idle", async () => {
    await setup()

    await expect(proxy!.queue({
      type: "chat.queue",
      chatId: "chat-idle",
      content: "Run now",
    })).resolves.toEqual({ chatId: "chat-idle", queued: false })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { data: Record<string, unknown> }
    expect(msg.data.content).toBe("Run now")
  })

  test("cancel() forwards CancelTurnCommand", async () => {
    await setup()

    await proxy!.cancel("chat-456")

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.cancel_turn`)
    expect(msg.data).toEqual({ chatId: "chat-456" })
  })

  test("respondTool() forwards RespondToolCommand", async () => {
    await setup()

    await proxy!.respondTool({
      type: "chat.respondTool",
      chatId: "chat-789",
      toolUseId: "tool-1",
      result: "user approved",
    })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.respond_tool`)
    expect(msg.data).toEqual({
      chatId: "chat-789",
      toolUseId: "tool-1",
      result: "user approved",
    })
  })

  test("getActiveStatuses() delegates to provided function", async () => {
    const { activeStatuses } = await setup()

    activeStatuses.set("chat-a", "running")
    activeStatuses.set("chat-b", "idle")

    const result = proxy!.getActiveStatuses()
    expect(result.size).toBe(2)
    expect(result.get("chat-a")).toBe("running")
    expect(result.get("chat-b")).toBe("idle")
  })

  test("activeTurns.has() returns true for active chats", async () => {
    const { activeStatuses } = await setup()

    activeStatuses.set("active-chat", "running")

    expect(proxy!.activeTurns.has("active-chat")).toBe(true)
    expect(proxy!.activeTurns.has("inactive-chat")).toBe(false)
  })

  test("activeTurns.has() returns true immediately after starting a chat", async () => {
    await setup()

    await proxy!.startTurnForChat({
      chatId: "just-started-chat",
      provider: "codex",
      content: "Initial task",
      model: "gpt-5.4",
      planMode: false,
      appendUserPrompt: true,
    })

    expect(proxy!.activeTurns.has("just-started-chat")).toBe(true)
  })

  test("startTurnForChat() forwards StartTurnCommand and persists model", async () => {
    const { store } = await setup()

    await proxy!.startTurnForChat({
      chatId: "orch-chat",
      provider: "claude",
      content: "Orchestrated task",
      delegatedContext: "Forked parent chat context:\nUser: Investigate the auth race.",
      isSpawned: true,
      model: "sonnet",
      planMode: false,
      appendUserPrompt: true,
    })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.start_turn`)
    expect(msg.data).toMatchObject({
      chatId: "orch-chat",
      provider: "claude",
      content: "Orchestrated task",
      delegatedContext: "Forked parent chat context:\nUser: Investigate the auth race.",
      isSpawned: true,
      model: "sonnet",
      planMode: false,
      appendUserPrompt: true,
      workspaceLocalPath: "/tmp/test-project",
    })

    const modelCall = store._calls.find((c) => c.method === "setChatModel")
    expect(modelCall).toEqual({ method: "setChatModel", args: ["orch-chat", "sonnet"] })
  })

  test("disposeChat() calls cancel and does not throw if cancel fails", async () => {
    await setup()

    // disposeChat calls cancel internally — should not throw even if runner errors
    await proxy!.disposeChat("chat-dispose")

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.cancel_turn`)
  })

  describe("drainDelegationResult", () => {
    test("drainDelegationResult starts parent turn when idle + no user queued turn", async () => {
      await setup()

      const result = await proxy!.drainDelegationResult("parent-chat", "deleg-1")

      expect(result).toBe(true)
      expect(mockRunner!.received).toHaveLength(1)
      const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
      expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.start_turn`)
      expect(msg.data).toMatchObject({
        chatId: "parent-chat",
        appendUserPrompt: false,
      })
      expect(msg.data.content).toContain("Delegation result ready")
    })

    test("drainDelegationResult does NOT fire when parent has active turn", async () => {
      const { activeStatuses } = await setup()
      activeStatuses.set("parent-chat", "running")

      const result = await proxy!.drainDelegationResult("parent-chat", "deleg-1")

      expect(result).toBe(false)
      expect(mockRunner!.received).toHaveLength(0)
    })

    test("drainDelegationResult does NOT fire when parent has user queued turn", async () => {
      const { activeStatuses } = await setup()
      // Queue a user turn while the chat is active
      activeStatuses.set("parent-chat", "running")
      await proxy!.queue({
        type: "chat.queue",
        chatId: "parent-chat",
        content: "User follow-up",
      })
      // Turn ends — but there's a queued user turn
      activeStatuses.delete("parent-chat")

      const result = await proxy!.drainDelegationResult("parent-chat", "deleg-1")

      expect(result).toBe(false)
      expect(mockRunner!.received).toHaveLength(0)
    })
  })

  test("sendCommand throws on runner error response", async () => {
    // Set up a runner that returns errors
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })

    const sub = runnerNc.subscribe(`runtime.runner.cmd.${RUNNER_ID}.>`)
    void (async () => {
      for await (const msg of sub) {
        msg.respond(
          encoder.encode(JSON.stringify({ ok: false, error: "Turn already active" })),
        )
      }
    })()
    await runnerNc.flush()

    proxy = new RunnerProxy({
      nc: clientNc,
      store: createMockStore(),
      runnerId: RUNNER_ID,
      getActiveStatuses: () => new Map(),
      getRunnerReadiness: () => ({ incompatible: false, protocolVersion: 1 }),
    })

    await expect(proxy.cancel("chat-err")).rejects.toThrow("Turn already active")

    sub.unsubscribe()
  })
})

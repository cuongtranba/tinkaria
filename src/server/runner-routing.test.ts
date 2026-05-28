/**
 * runner-routing.test.ts
 *
 * Tests the per-session dispatch layer added in Stage 2 of PR5.
 * These tests exercise RunnerProxy with a real (embedded) NATS server but a
 * fake RunnerRouter and a fake EventStore, so no disk I/O or live runner is needed.
 *
 * Contract under test:
 *  - resolveRunnerForChat selects and persists the runner the first time
 *  - sticky pin is honoured on subsequent turns (no re-persist when unchanged)
 *  - cancel/respondTool/disposeChat go to the PINNED runner, never re-route
 *  - needs_pick (non-empty candidates) throws RunnerPickRequired
 *  - needs_pick (empty candidates) throws a plain Error (fail-fast)
 *  - unavailable throws a plain Error (fail-fast)
 *  - per-runner capability gate is enforced by sendCommand
 */

import { describe, test, expect, afterEach } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { RunnerProxy, RunnerPickRequired } from "./runner-proxy"
import type { RunnerRouter, RunnerSelection, RunnerDescriptor } from "./runner-router"
import type { SessionStatus } from "../shared/types"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ── Fake runner (NATS subscriber) ────────────────────────────────────────────

function createMockRunner(nc: NatsConnection, runnerId: string) {
  const received: { subject: string; data: unknown }[] = []
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

// ── Minimal store stub ────────────────────────────────────────────────────────

interface StubChat {
  id: string
  workspaceId: string
  repoId: null
  title: string
  provider: "claude" | "codex" | null
  model: string | null
  sessionToken: null
  planMode: boolean
  runnerId?: string | null
}

function createMockStore(chatOverrides?: Partial<StubChat>) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const chat: StubChat = {
    id: "chat-1",
    workspaceId: "ws-1",
    repoId: null,
    title: "Test",
    provider: "claude",
    model: "sonnet",
    sessionToken: null,
    planMode: false,
    runnerId: undefined,
    ...chatOverrides,
  }

  return {
    requireChat: (_chatId: string) => ({ ...chat }),
    getProject: (_wsId: string) => ({ id: "ws-1", localPath: "/tmp/proj", title: "Proj" }),
    getMessages: async (_chatId: string) => [] as unknown[],
    createChat: async (workspaceId: string) => ({
      id: "new-chat",
      workspaceId,
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
    setChatRunner: async (chatId: string, runnerId: string | null) => {
      calls.push({ method: "setChatRunner", args: [chatId, runnerId] })
      // Mutate the in-memory chat so subsequent requireChat calls see the pin
      chat.runnerId = runnerId
    },
    enqueueQueuedTurn: async (args: unknown) => {
      calls.push({ method: "enqueueQueuedTurn", args: [args] })
    },
    getQueuedTurn: (_chatId: string) => null,
    clearQueuedTurn: async (_chatId: string) => {},
    state: {
      providerProfiles: new Map(),
      workspaceProfileOverrides: new Map(),
    },
    _calls: calls,
    _chat: chat,
  } as unknown as import("./runner-proxy").RunnerProxyOptions["store"] & { _calls: typeof calls; _chat: StubChat }
}

// ── Fake RunnerRouter ─────────────────────────────────────────────────────────

function makeRouter(selectFn: (req: Parameters<RunnerRouter["select"]>[0]) => Promise<RunnerSelection>): RunnerRouter {
  return {
    list: async () => [],
    get: async () => null,
    select: selectFn,
  } as unknown as RunnerRouter
}

function makeDescriptor(runnerId: string, overrides: Partial<RunnerDescriptor> = {}): RunnerDescriptor {
  return {
    runnerId,
    state: "online",
    capabilities: { providers: ["claude", "codex"] },
    protocolVersion: 1,
    incompatible: false,
    lastSeenAt: Date.now(),
    pid: null,
    ownerId: null,
    isShared: false,
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("RunnerProxy — per-session routing (Stage 2)", () => {
  let natsServer: NatsServer | null = null
  let clientNc: NatsConnection | null = null
  let runnerNc: NatsConnection | null = null

  afterEach(async () => {
    if (clientNc && !clientNc.isClosed()) await clientNc.drain()
    clientNc = null
    if (runnerNc && !runnerNc.isClosed()) await runnerNc.drain()
    runnerNc = null
    if (natsServer) await natsServer.stop()
    natsServer = null
  })

  // ── 1. First turn: no pin → router selects → persisted + dispatched ──────

  test("first turn with no chat.runnerId: setChatRunner called and command sent to selected runner", async () => {
    const R1 = "runner-R1"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })

    const r1Mock = createMockRunner(runnerNc, R1)
    await runnerNc.flush()

    const store = createMockStore({ runnerId: undefined })

    const router = makeRouter(async () => ({
      kind: "selected",
      runnerId: R1,
      sticky: false,
    }))

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({
        incompatible: false,
        protocolVersion: 1,
        capabilities: { providers: ["claude" as const, "codex" as const] },
      }),
    })

    await proxy.send({ type: "chat.send", chatId: "chat-1", content: "hello", model: "sonnet" })

    // setChatRunner called with R1
    const persistCall = store._calls.find((c) => c.method === "setChatRunner")
    expect(persistCall).toBeDefined()
    expect(persistCall!.args).toEqual(["chat-1", R1])

    // Command dispatched to R1's subject
    expect(r1Mock.received).toHaveLength(1)
    expect(r1Mock.received[0]!.subject).toBe(`runtime.runner.cmd.${R1}.start_turn`)

    r1Mock.dispose()
  })

  // ── 2. Sticky reused: pin already set, router returns sticky=true ─────────

  test("sticky pin: if runnerId unchanged setChatRunner not called again", async () => {
    const R1 = "runner-sticky"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    const r1Mock = createMockRunner(runnerNc, R1)
    await runnerNc.flush()

    // Chat already has runnerId=R1 pinned
    const store = createMockStore({ runnerId: R1 })

    const router = makeRouter(async () => ({
      kind: "selected",
      runnerId: R1,
      sticky: true,
    }))

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({
        incompatible: false,
        protocolVersion: 1,
        capabilities: { providers: ["claude" as const, "codex" as const] },
      }),
    })

    await proxy.send({ type: "chat.send", chatId: "chat-1", content: "hello", model: "sonnet" })

    // No setChatRunner because pin is unchanged
    const persistCall = store._calls.find((c) => c.method === "setChatRunner")
    expect(persistCall).toBeUndefined()

    // Command still goes to R1
    expect(r1Mock.received).toHaveLength(1)
    expect(r1Mock.received[0]!.subject).toBe(`runtime.runner.cmd.${R1}.start_turn`)

    r1Mock.dispose()
  })

  // ── 3. cancel dispatched to pinned runner, router.select NOT called ───────

  test("cancel dispatches to pinned chat.runnerId without calling router", async () => {
    const R2 = "runner-pinned"
    const R1 = "runner-other"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    const r2Mock = createMockRunner(runnerNc, R2)
    await runnerNc.flush()

    const store = createMockStore({ runnerId: R2 })

    let routerSelectCalled = false
    const router = makeRouter(async () => {
      routerSelectCalled = true
      return { kind: "selected", runnerId: R1, sticky: false }
    })

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({ incompatible: false, protocolVersion: 1, capabilities: null }),
    })

    await proxy.cancel("chat-1")

    expect(routerSelectCalled).toBe(false)
    expect(r2Mock.received).toHaveLength(1)
    expect(r2Mock.received[0]!.subject).toBe(`runtime.runner.cmd.${R2}.cancel_turn`)

    r2Mock.dispose()
  })

  // ── 4. respondTool dispatched to pinned runner ────────────────────────────

  test("respondTool dispatches to pinned runner, router.select NOT called", async () => {
    const R2 = "runner-for-tool"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    const r2Mock = createMockRunner(runnerNc, R2)
    await runnerNc.flush()

    const store = createMockStore({ runnerId: R2 })

    let routerSelectCalled = false
    const router = makeRouter(async () => {
      routerSelectCalled = true
      return { kind: "selected", runnerId: "other", sticky: false }
    })

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({ incompatible: false, protocolVersion: 1, capabilities: null }),
    })

    await proxy.respondTool({ type: "chat.respondTool", chatId: "chat-1", toolUseId: "tool-1", result: "ok" })

    expect(routerSelectCalled).toBe(false)
    expect(r2Mock.received).toHaveLength(1)
    expect(r2Mock.received[0]!.subject).toBe(`runtime.runner.cmd.${R2}.respond_tool`)

    r2Mock.dispose()
  })

  // ── 5. disposeChat dispatches to pinned runner ────────────────────────────

  test("disposeChat (cancel + stop_chat_pty) dispatches to pinned runner", async () => {
    const R2 = "runner-dispose"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    const r2Mock = createMockRunner(runnerNc, R2)
    await runnerNc.flush()

    const store = createMockStore({ runnerId: R2 })

    let routerSelectCalled = false
    const router = makeRouter(async () => {
      routerSelectCalled = true
      return { kind: "selected", runnerId: "other", sticky: false }
    })

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({ incompatible: false, protocolVersion: 1, capabilities: null }),
    })

    await proxy.disposeChat("chat-1")

    expect(routerSelectCalled).toBe(false)
    const subjects = r2Mock.received.map((m) => m.subject)
    expect(subjects).toContain(`runtime.runner.cmd.${R2}.cancel_turn`)
    expect(subjects).toContain(`runtime.runner.cmd.${R2}.stop_chat_pty`)

    r2Mock.dispose()
  })

  // ── 6. needs_pick with non-empty candidates → RunnerPickRequired ──────────

  test("needs_pick (non-empty candidates) throws RunnerPickRequired, no NATS request", async () => {
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    await runnerNc.flush()

    const captured: { subject: string }[] = []
    const sub = runnerNc.subscribe("runtime.runner.cmd.>")
    void (async () => { for await (const m of sub) captured.push({ subject: m.subject }) })()

    const store = createMockStore({ runnerId: undefined })
    const candidates = [makeDescriptor("runner-A"), makeDescriptor("runner-B")]

    const router = makeRouter(async () => ({
      kind: "needs_pick",
      candidates,
      reason: "ambiguous" as const,
    }))

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({ incompatible: false, protocolVersion: 1, capabilities: null }),
    })

    await expect(
      proxy.send({ type: "chat.send", chatId: "chat-1", content: "hi", model: "sonnet" }),
    ).rejects.toThrow(RunnerPickRequired)

    // Verify it is specifically RunnerPickRequired with the right fields
    let caught: RunnerPickRequired | null = null
    try {
      await proxy.send({ type: "chat.send", chatId: "chat-1", content: "hi", model: "sonnet" })
    } catch (err) {
      if (err instanceof RunnerPickRequired) caught = err
    }
    expect(caught).not.toBeNull()
    expect(caught!.chatId).toBe("chat-1")
    expect(caught!.candidates).toHaveLength(2)
    expect(caught!.reason).toBe("ambiguous")

    // No NATS command dispatched
    await runnerNc.flush()
    expect(captured).toHaveLength(0)

    sub.unsubscribe()
  })

  // ── 7. needs_pick with EMPTY candidates → plain Error (fail-fast) ─────────

  test("needs_pick (empty candidates) throws plain Error, no NATS request", async () => {
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    await runnerNc.flush()

    const captured: { subject: string }[] = []
    const sub = runnerNc.subscribe("runtime.runner.cmd.>")
    void (async () => { for await (const m of sub) captured.push({ subject: m.subject }) })()

    const store = createMockStore({ runnerId: undefined })

    const router = makeRouter(async () => ({
      kind: "needs_pick",
      candidates: [],  // empty — dead-end guard
      reason: "ambiguous" as const,
    }))

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({ incompatible: false, protocolVersion: 1, capabilities: null }),
    })

    await expect(
      proxy.send({ type: "chat.send", chatId: "chat-1", content: "hi", model: "sonnet" }),
    ).rejects.toThrow(Error)

    // Must NOT be a RunnerPickRequired (plain Error expected)
    let caught: Error | null = null
    try {
      await proxy.send({ type: "chat.send", chatId: "chat-1", content: "hi", model: "sonnet" })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught instanceof RunnerPickRequired).toBe(false)

    await runnerNc.flush()
    expect(captured).toHaveLength(0)

    sub.unsubscribe()
  })

  // ── 8. unavailable → plain Error (fail-fast) ──────────────────────────────

  test("unavailable throws plain Error, no NATS request", async () => {
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    await runnerNc.flush()

    const captured: { subject: string }[] = []
    const sub = runnerNc.subscribe("runtime.runner.cmd.>")
    void (async () => { for await (const m of sub) captured.push({ subject: m.subject }) })()

    const store = createMockStore({ runnerId: undefined })

    const router = makeRouter(async () => ({
      kind: "unavailable",
      reason: 'No online runner for "claude" — pair or start a runner.',
    }))

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      getRunnerReadiness: (_id) => ({ incompatible: false, protocolVersion: 1, capabilities: null }),
    })

    await expect(
      proxy.send({ type: "chat.send", chatId: "chat-1", content: "hi", model: "sonnet" }),
    ).rejects.toThrow('No online runner for "claude"')

    await runnerNc.flush()
    expect(captured).toHaveLength(0)

    sub.unsubscribe()
  })

  // ── 9. Per-runner capability gate: selected runner can't run provider ──────

  test("capability gate refuses a selected runner that can't run the requested provider", async () => {
    const R1 = "runner-no-codex"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    const r1Mock = createMockRunner(runnerNc, R1)
    await runnerNc.flush()

    const store = createMockStore({ runnerId: undefined, provider: "codex" })

    const router = makeRouter(async () => ({
      kind: "selected",
      runnerId: R1,
      sticky: false,
    }))

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: "shared-runner",
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      router,
      sharedRunnerId: () => "shared-runner",
      // getRunnerReadiness says R1 only supports claude, not codex
      getRunnerReadiness: (_id) => ({
        incompatible: false,
        protocolVersion: 1,
        capabilities: { providers: ["claude" as const] },
      }),
    })

    await expect(
      proxy.send({ type: "chat.send", chatId: "chat-1", content: "hi", model: "gpt-5" }),
    ).rejects.toThrow(/cannot run codex/)

    // No command dispatched to R1
    expect(r1Mock.received).toHaveLength(0)

    r1Mock.dispose()
  })

  // ── 10. No router → legacy path: dispatches to this.runnerId unchanged ────

  test("no router → legacy single-runner path, no setChatRunner called", async () => {
    const SHARED = "shared-legacy"
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })
    const sharedMock = createMockRunner(runnerNc, SHARED)
    await runnerNc.flush()

    const store = createMockStore({ runnerId: undefined })

    const proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: SHARED,
      getActiveStatuses: () => new Map<string, SessionStatus>(),
      // No router — legacy behavior
      getRunnerReadiness: (_id) => ({
        incompatible: false,
        protocolVersion: 1,
        capabilities: { providers: ["claude" as const, "codex" as const] },
      }),
    })

    await proxy.send({ type: "chat.send", chatId: "chat-1", content: "hello", model: "sonnet" })

    expect(store._calls.find((c) => c.method === "setChatRunner")).toBeUndefined()
    expect(sharedMock.received).toHaveLength(1)
    expect(sharedMock.received[0]!.subject).toBe(`runtime.runner.cmd.${SHARED}.start_turn`)

    sharedMock.dispose()
  })
})

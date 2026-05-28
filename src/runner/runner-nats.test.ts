import { describe, test, expect, afterEach, beforeEach, mock, spyOn } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import { RunnerNatsHandler, connectRunner, shutdownConnection, probeProviders } from "./runner-nats"
import { RunnerAgent, type TurnFactory } from "./runner-agent"
import type { ResolveClaudeBinaryResult } from "../server/claude-pty/resolve-binary.adapter"
import {
  runnerCmdSubject,
  runnerHeartbeatSubject,
  RUNNER_EVENTS_STREAM,
  ALL_RUNNER_EVENTS,
  RUNNER_REGISTRY_BUCKET,
  type StartTurnCommand,
  type CancelTurnCommand,
  type RunnerRegistration,
} from "../shared/runner-protocol"
import type { HarnessEvent, HarnessTurn } from "../shared/harness-types"
import type { TranscriptEntry } from "../shared/types"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function ts<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

function createMockTurn(events: HarnessEvent[]): HarnessTurn {
  let interrupted = false
  return {
    provider: "claude",
    stream: (async function* () {
      for (const event of events) {
        if (interrupted) return
        yield event
      }
    })(),
    interrupt: async () => { interrupted = true },
    close: () => {},
  }
}

describe("RunnerNatsHandler", () => {
  let server: NatsServer
  let nc: NatsConnection
  let handlerNc: NatsConnection
  let tmpDir: string | null = null

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-test-"))
    server = await NatsServer.start({ jetstream: true, storeDir: tmpDir })
    nc = await connect({ servers: server.url })
    handlerNc = await connect({ servers: server.url })
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
  })

  afterEach(async () => {
    await nc?.drain()
    await handlerNc?.drain()
    await server?.stop()
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("subscribes to start_turn and dispatches to RunnerAgent", async () => {
    let turnStarted = false
    const turnFactory: TurnFactory = async () => {
      turnStarted = true
      return createMockTurn([
        { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) },
      ])
    }

    const agent = new RunnerAgent({ nc: handlerNc, createTurn: turnFactory })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1" })
    await handler.start()

    const cmd: StartTurnCommand = {
      chatId: "chat-1",
      provider: "claude",
      content: "hello",
      model: "test-model",
      planMode: false,
      appendUserPrompt: true,
      workspaceLocalPath: "/tmp",
      sessionToken: null,
      chatTitle: "New Chat",
      existingMessageCount: 0,
      workspaceId: "p1",
    }

    const reply = await nc.request(
      runnerCmdSubject("r1", "start_turn"),
      encoder.encode(JSON.stringify(cmd)),
      { timeout: 2000 }
    )
    const response = JSON.parse(decoder.decode(reply.data))
    expect(response.ok).toBe(true)

    await new Promise((r) => setTimeout(r, 200))
    expect(turnStarted).toBe(true)

    handler.dispose()
  })

  test("subscribes to cancel_turn and dispatches to RunnerAgent", async () => {
    let unblock: (() => void) | null = null
    const turnFactory: TurnFactory = async () => ({
      provider: "claude",
      stream: (async function* () {
        yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
        await new Promise<void>((r) => { unblock = r })
      })(),
      interrupt: async () => { unblock?.() },
      close: () => {},
    })

    const agent = new RunnerAgent({ nc: handlerNc, createTurn: turnFactory })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1" })
    await handler.start()

    const startCmd: StartTurnCommand = {
      chatId: "chat-1", provider: "claude", content: "hello", model: "m",
      planMode: false, appendUserPrompt: true, workspaceLocalPath: "/tmp",
      sessionToken: null, chatTitle: "New Chat", existingMessageCount: 0, workspaceId: "p1",
    }
    await nc.request(runnerCmdSubject("r1", "start_turn"), encoder.encode(JSON.stringify(startCmd)), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 100))

    const cancelCmd: CancelTurnCommand = { chatId: "chat-1" }
    const reply = await nc.request(
      runnerCmdSubject("r1", "cancel_turn"),
      encoder.encode(JSON.stringify(cancelCmd)),
      { timeout: 2000 }
    )
    const response = JSON.parse(decoder.decode(reply.data))
    expect(response.ok).toBe(true)

    await new Promise((r) => setTimeout(r, 200))
    expect(agent.activeTurns.has("chat-1")).toBe(false)

    handler.dispose()
  })

  test("publishes heartbeat periodically", async () => {
    const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1", heartbeatIntervalMs: 100 })
    await handler.start()

    const heartbeats: unknown[] = []
    const sub = nc.subscribe(runnerHeartbeatSubject("r1"))
    void (async () => {
      for await (const msg of sub) {
        heartbeats.push(JSON.parse(decoder.decode(msg.data)))
      }
    })()

    await new Promise((r) => setTimeout(r, 350))
    expect(heartbeats.length).toBeGreaterThanOrEqual(2)

    sub.unsubscribe()
    handler.dispose()
  })

  test("registers in KV bucket on start", async () => {
    const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1" })
    await handler.start()

    // Read from KV using the client connection
    const kvm = new Kvm(nc)
    const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
    const entry = await kvStore.get("r1")
    expect(entry).toBeDefined()
    const registration = JSON.parse(decoder.decode(entry!.value)) as RunnerRegistration
    expect(registration.runnerId).toBe("r1")
    expect(registration.pid).toBe(process.pid)

    handler.dispose()
  })
})

describe("runner NATS reconnect resilience", () => {
  test("connectRunner is called with explicit reconnect options", async () => {
    const capturedOpts: Array<Record<string, unknown>> = []
    const fakeNc = { isFakeNc: true } as unknown as NatsConnection
    const fakeConnect = mock(async (opts: Record<string, unknown>) => {
      capturedOpts.push(opts)
      return fakeNc
    })

    const result = await connectRunner({
      natsUrl: "nats://test:4222",
      token: "test-token",
      connectFn: fakeConnect as unknown as typeof connect,
    })

    expect(result).toBe(fakeNc)
    expect(fakeConnect).toHaveBeenCalledTimes(1)
    expect(capturedOpts.length).toBe(1)
    const opts = capturedOpts[0]!
    expect(opts.servers).toBe("nats://test:4222")
    expect(opts.token).toBe("test-token")
    expect(opts.maxReconnectAttempts).toBe(-1)
    expect(opts.reconnectTimeWait).toBe(750)
    expect(opts.pingInterval).toBe(15_000)
    expect(opts.maxPingOut).toBe(3)
  })

  test("connectRunner omits token when undefined but still passes reconnect options", async () => {
    const capturedOpts: Array<Record<string, unknown>> = []
    const fakeNc = {} as unknown as NatsConnection
    const fakeConnect = mock(async (opts: Record<string, unknown>) => {
      capturedOpts.push(opts)
      return fakeNc
    })

    await connectRunner({
      natsUrl: "nats://test:4222",
      token: undefined,
      connectFn: fakeConnect as unknown as typeof connect,
    })

    const opts = capturedOpts[0]!
    expect(opts.token).toBeUndefined()
    expect(opts.maxReconnectAttempts).toBe(-1)
    expect(opts.reconnectTimeWait).toBe(750)
    expect(opts.pingInterval).toBe(15_000)
    expect(opts.maxPingOut).toBe(3)
  })

  test("shutdownConnection times out drain and falls back to close", async () => {
    let closeCalled = false
    const fakeNc = {
      drain: mock(() => new Promise<void>(() => { /* never resolves */ })),
      close: mock(async () => { closeCalled = true }),
    } as unknown as NatsConnection

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const started = Date.now()
      await shutdownConnection(fakeNc, { drainTimeoutMs: 200 })
      const elapsed = Date.now() - started
      expect(closeCalled).toBe(true)
      expect(elapsed).toBeLessThan(1_000)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("shutdownConnection completes normally when drain resolves fast", async () => {
    let drainCalled = false
    let closeCalled = false
    const fakeNc = {
      drain: mock(async () => { drainCalled = true }),
      close: mock(async () => { closeCalled = true }),
    } as unknown as NatsConnection

    await shutdownConnection(fakeNc, { drainTimeoutMs: 500 })
    expect(drainCalled).toBe(true)
    expect(closeCalled).toBe(false)
  })

  test("shutdownConnection warns if close() also fails after drain timeout", async () => {
    const fakeNc = {
      drain: mock(() => new Promise<void>(() => { /* never resolves */ })),
      close: mock(async () => { throw new Error("close exploded") }),
    } as unknown as NatsConnection

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      // Should not throw even though close() errors.
      await shutdownConnection(fakeNc, { drainTimeoutMs: 100 })
      expect(warnSpy).toHaveBeenCalled()
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(" "))
      const mentionsCloseFailure = warnCalls.some((line) => line.includes("close() also failed"))
      expect(mentionsCloseFailure).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("publishHeartbeat swallows and logs publish errors", async () => {

    const fakeNc = {
      publish: mock(() => { throw new Error("nats closed") }),
      flush: mock(async () => {}),
      subscribe: mock(() => ({
        unsubscribe: () => {},
        [Symbol.asyncIterator]: async function* () { /* no-op */ },
      })),
    } as unknown as NatsConnection

    const agent = {
      activeTurns: new Map<string, unknown>(),
    } as unknown as RunnerAgent

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const handler = new RunnerNatsHandler({ nc: fakeNc, agent, runnerId: "r-fake" })
      // Call the (now public-for-test) publishHeartbeat directly via a type-safe shim.
      const publishAccessor = (handler as unknown as {
        publishHeartbeatForTest: () => void
      }).publishHeartbeatForTest
      expect(typeof publishAccessor).toBe("function")
      expect(() => publishAccessor.call(handler)).not.toThrow()

      const warnCalls = warnSpy.mock.calls.map((c) => c.join(" "))
      const mentionsHeartbeatFailure = warnCalls.some((line) =>
        line.includes("heartbeat publish failed")
      )
      expect(mentionsHeartbeatFailure).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

// ── PR4 Stage 2: probeProviders + capability-advertise ────────────────

describe("probeProviders", () => {
  test("includes claude when resolver succeeds", async () => {
    const fakeResolver = async (): Promise<ResolveClaudeBinaryResult> =>
      ({ path: "/usr/local/bin/claude", source: "PATH", triedPaths: [] })

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const caps = await probeProviders(fakeResolver)
      expect(caps.providers).toContain("claude")
      // claude-pty rides on the same claude binary, so it must be advertised
      // alongside claude — otherwise the server capability gate refuses it.
      expect(caps.providers).toContain("claude-pty")
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("excludes claude and claude-pty when resolver throws", async () => {
    const failingResolver = async (): Promise<ResolveClaudeBinaryResult> => {
      throw new Error("claude not found")
    }

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const caps = await probeProviders(failingResolver)
      expect(caps.providers).not.toContain("claude")
      expect(caps.providers).not.toContain("claude-pty")
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("probe error does not crash — returns partial providers list", async () => {
    // Simulate a resolver that always throws — probeProviders must return gracefully.
    const failingResolver = async (): Promise<ResolveClaudeBinaryResult> => {
      throw new Error("unexpected probe failure")
    }

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const caps = await probeProviders(failingResolver)
      expect(Array.isArray(caps.providers)).toBe(true)
      // May or may not include codex depending on the test env; no throw is the key assertion.
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("RunnerNatsHandler — capability probe advertised in KV registration", () => {
  let server: NatsServer
  let nc: NatsConnection
  let handlerNc: NatsConnection
  let tmpDir: string | null = null

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-probe-test-"))
    server = await NatsServer.start({ jetstream: true, storeDir: tmpDir })
    nc = await connect({ servers: server.url })
    handlerNc = await connect({ servers: server.url })
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
  })

  afterEach(async () => {
    await nc?.drain()
    await handlerNc?.drain()
    await server?.stop()
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("claude resolves, codex does not → providers=[claude] in KV registration", async () => {
    // Mock resolver: claude resolves, codex absent (spawnSync("which","codex") returns non-zero
    // when run in the probe; we control only the claude resolver here, and codex is probed
    // via the real spawnSync — but we override the full _probeProviders to isolate the test).
    const fakeProbeFn = async () => ({ providers: ["claude" as const] })

    const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
    const handler = new RunnerNatsHandler({
      nc: handlerNc,
      agent,
      runnerId: "r-probe",
      _probeProviders: fakeProbeFn,
    })
    await handler.start()

    const kvm = new Kvm(nc)
    const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
    const entry = await kvStore.get("r-probe")
    expect(entry).toBeDefined()
    const registration = JSON.parse(decoder.decode(entry!.value)) as RunnerRegistration
    expect(registration.capabilities?.providers).toEqual(["claude"])
    expect(registration.providers).toEqual(["claude"])

    handler.dispose()
  })

  test("both providers installed → providers=[claude, codex] in KV registration", async () => {
    const fakeProbeFn = async () => ({ providers: ["claude" as const, "codex" as const] })

    const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
    const handler = new RunnerNatsHandler({
      nc: handlerNc,
      agent,
      runnerId: "r-both",
      _probeProviders: fakeProbeFn,
    })
    await handler.start()

    const kvm = new Kvm(nc)
    const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
    const entry = await kvStore.get("r-both")
    const registration = JSON.parse(decoder.decode(entry!.value)) as RunnerRegistration
    expect(registration.capabilities?.providers).toEqual(["claude", "codex"])

    handler.dispose()
  })

  test("probe throws → registration proceeds with empty providers", async () => {
    const failProbeFn = async (): Promise<{ providers: ("claude" | "codex")[] }> => {
      throw new Error("probe catastrophically failed")
    }

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
      const handler = new RunnerNatsHandler({
        nc: handlerNc,
        agent,
        runnerId: "r-probe-fail",
        _probeProviders: failProbeFn,
      })
      await handler.start()

      const kvm = new Kvm(nc)
      const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
      const entry = await kvStore.get("r-probe-fail")
      expect(entry).toBeDefined()
      const registration = JSON.parse(decoder.decode(entry!.value)) as RunnerRegistration
      // Empty list — probe failed but registration didn't crash.
      expect(registration.capabilities?.providers).toEqual([])

      handler.dispose()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

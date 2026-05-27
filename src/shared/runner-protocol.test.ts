import { describe, test, expect } from "bun:test"
import {
  runnerHeartbeatSubject,
  runnerCmdSubject,
  runnerEventsSubject,
  RUNNER_REGISTRY_BUCKET,
  RUNNER_EVENTS_STREAM,
  ALL_RUNNER_EVENTS,
  PROTOCOL_VERSION,
  SUPPORTED_RANGE,
  isProtocolSupported,
  runnerLivenessState,
  LIVENESS_DEGRADED_MS,
  LIVENESS_OFFLINE_MS,
  type RunnerTurnEvent,
  type StartTurnCommand,
  type CancelTurnCommand,
  type RespondToolCommand,
  type ShutdownCommand,
  type RunnerRegistration,
  type RunnerHeartbeat,
} from "./runner-protocol"

describe("runner protocol subjects", () => {
  test("heartbeat subject", () => {
    expect(runnerHeartbeatSubject("r1")).toBe("runtime.runner.heartbeat.r1")
  })

  test("command subjects", () => {
    expect(runnerCmdSubject("r1", "start_turn")).toBe("runtime.runner.cmd.r1.start_turn")
    expect(runnerCmdSubject("r1", "cancel_turn")).toBe("runtime.runner.cmd.r1.cancel_turn")
    expect(runnerCmdSubject("r1", "respond_tool")).toBe("runtime.runner.cmd.r1.respond_tool")
    expect(runnerCmdSubject("r1", "shutdown")).toBe("runtime.runner.cmd.r1.shutdown")
  })

  test("events subject", () => {
    expect(runnerEventsSubject("chat-123")).toBe("runtime.runner.evt.chat-123")
  })

  test("registry bucket constant", () => {
    expect(RUNNER_REGISTRY_BUCKET).toBe("runtime_runner_registry")
  })

  test("stream constants", () => {
    expect(RUNNER_EVENTS_STREAM).toBe("KANNA_RUNNER_EVENTS")
    expect(ALL_RUNNER_EVENTS).toBe("runtime.runner.evt.>")
  })
})

describe("runner protocol types", () => {
  test("RunnerTurnEvent discriminated union covers all event types", () => {
    const events: RunnerTurnEvent[] = [
      { type: "transcript", chatId: "c1", entry: { _id: "e1", kind: "assistant_text", text: "hi", createdAt: 1 } as any },
      { type: "session_token", chatId: "c1", sessionToken: "tok" },
      { type: "status_change", chatId: "c1", status: "running" as any },
      { type: "pending_tool", chatId: "c1", tool: null },
      { type: "turn_finished", chatId: "c1" },
      { type: "turn_failed", chatId: "c1", error: "oops" },
      { type: "turn_cancelled", chatId: "c1" },
      { type: "title_generated", chatId: "c1", title: "My Chat" },
      { type: "plan_mode_set", chatId: "c1", planMode: true },
      { type: "provider_set", chatId: "c1", provider: "claude" },
      { type: "context_cleared", chatId: "c1" },
    ]
    expect(events).toHaveLength(11)
    // Verify each type is unique
    const types = events.map(e => e.type)
    expect(new Set(types).size).toBe(11)
  })

  test("StartTurnCommand has required fields", () => {
    const cmd: StartTurnCommand = {
      chatId: "c1", provider: "claude", content: "hello",
      delegatedContext: "Forked parent chat context:\nUser: earlier work",
      isSpawned: true,
      model: "claude-sonnet-4-6", planMode: false, appendUserPrompt: true,
      workspaceLocalPath: "/tmp", sessionToken: null, chatTitle: "New Chat",
      existingMessageCount: 0, workspaceId: "p1",
    }
    expect(cmd.chatId).toBe("c1")
    expect(cmd.provider).toBe("claude")
    expect(cmd.delegatedContext).toContain("Forked parent chat context:")
    expect(cmd.isSpawned).toBe(true)
  })

  test("CancelTurnCommand has required fields", () => {
    const cmd: CancelTurnCommand = { chatId: "c1" }
    expect(cmd.chatId).toBe("c1")
  })

  test("RespondToolCommand has required fields", () => {
    const cmd: RespondToolCommand = { chatId: "c1", toolUseId: "t1", result: "approved" }
    expect(cmd.chatId).toBe("c1")
    expect(cmd.toolUseId).toBe("t1")
  })

  test("ShutdownCommand has required fields", () => {
    const cmd: ShutdownCommand = { reason: "user_requested" }
    expect(cmd.reason).toBe("user_requested")
  })

  test("RunnerRegistration has required fields", () => {
    const reg: RunnerRegistration = {
      runnerId: "r1", pid: 123, startedAt: Date.now(), providers: ["claude", "codex"],
      protocolVersion: 1,
    }
    expect(reg.runnerId).toBe("r1")
    expect(reg.protocolVersion).toBe(1)
  })

  test("RunnerHeartbeat has required fields", () => {
    const hb: RunnerHeartbeat = {
      runnerId: "r1", activeChatIds: ["c1", "c2"], ts: Date.now(),
    }
    expect(hb.runnerId).toBe("r1")
    expect(hb.activeChatIds).toHaveLength(2)
  })
})

describe("protocol version constants", () => {
  test("PROTOCOL_VERSION is 1", () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })

  test("SUPPORTED_RANGE min=max=PROTOCOL_VERSION", () => {
    expect(SUPPORTED_RANGE.min).toBe(PROTOCOL_VERSION)
    expect(SUPPORTED_RANGE.max).toBe(PROTOCOL_VERSION)
  })
})

describe("isProtocolSupported", () => {
  test("returns true for v1 (current)", () => {
    expect(isProtocolSupported(1)).toBe(true)
  })

  test("returns false for v0 (below range)", () => {
    expect(isProtocolSupported(0)).toBe(false)
  })

  test("returns false for v2 (above range)", () => {
    expect(isProtocolSupported(2)).toBe(false)
  })

  test("returns false for negative version", () => {
    expect(isProtocolSupported(-1)).toBe(false)
  })
})

describe("runnerLivenessState", () => {
  const NOW = 1_000_000

  test("null lastHeartbeatAt → offline", () => {
    expect(runnerLivenessState(null, NOW)).toBe("offline")
  })

  test("age=0 → online", () => {
    expect(runnerLivenessState(NOW, NOW)).toBe("online")
  })

  test("age=24_999 (just under LIVENESS_DEGRADED_MS) → online", () => {
    expect(runnerLivenessState(NOW - (LIVENESS_DEGRADED_MS - 1), NOW)).toBe("online")
  })

  test("age=25_000 (at LIVENESS_DEGRADED_MS) → degraded", () => {
    expect(runnerLivenessState(NOW - LIVENESS_DEGRADED_MS, NOW)).toBe("degraded")
  })

  test("age=59_999 (just under LIVENESS_OFFLINE_MS) → degraded", () => {
    expect(runnerLivenessState(NOW - (LIVENESS_OFFLINE_MS - 1), NOW)).toBe("degraded")
  })

  test("age=60_000 (at LIVENESS_OFFLINE_MS) → offline", () => {
    expect(runnerLivenessState(NOW - LIVENESS_OFFLINE_MS, NOW)).toBe("offline")
  })

  test("age=100_000 (well above LIVENESS_OFFLINE_MS) → offline", () => {
    expect(runnerLivenessState(NOW - 100_000, NOW)).toBe("offline")
  })
})

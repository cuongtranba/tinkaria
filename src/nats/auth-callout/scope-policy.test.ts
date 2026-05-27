import { describe, test, expect } from "bun:test"
import { permissionsFor, runnerKvKeySubject, runnerCmdWildcard } from "./scope-policy"

// Helper: check whether a subject is covered by an allow list.
// NATS uses prefix-match with ">" wildcard and exact ">" suffix.
function matchesAny(subject: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchesNats(subject, pattern)) return true
  }
  return false
}

function matchesNats(subject: string, pattern: string): boolean {
  if (pattern === subject) return true
  if (pattern.endsWith(".>")) {
    const prefix = pattern.slice(0, -1) // "foo.>"  -> "foo."
    if (subject.startsWith(prefix)) return true
  }
  return false
}

// ── server-admin ──────────────────────────────────────────────────────────────

describe("server-admin scope", () => {
  const scope = permissionsFor({ class: "server-admin" })

  test("may publish to runtime.>", () => {
    expect(matchesAny("runtime.runner.cmd.A.start", scope.pub.allow)).toBe(true)
  })

  test("may publish to JetStream API", () => {
    expect(matchesAny("$JS.API.STREAM.INFO", scope.pub.allow)).toBe(true)
  })

  test("may publish to KV", () => {
    expect(matchesAny("$KV.runtime_runner_registry.someRunner", scope.pub.allow)).toBe(true)
  })

  test("may subscribe to callout subject", () => {
    expect(matchesAny("$SYS.REQ.USER.AUTH", scope.sub.allow)).toBe(true)
  })

  test("no deny rules", () => {
    expect(scope.pub.deny).toHaveLength(0)
    expect(scope.sub.deny).toHaveLength(0)
  })
})

// ── ui-client ─────────────────────────────────────────────────────────────────

describe("ui-client scope", () => {
  const scope = permissionsFor({ class: "ui-client" })

  test("may publish to runtime.cmd.>", () => {
    expect(matchesAny("runtime.cmd.someCommand", scope.pub.allow)).toBe(true)
  })

  test("may subscribe to runner events", () => {
    expect(matchesAny("runtime.runner.evt.chat123", scope.sub.allow)).toBe(true)
  })

  test("may subscribe to snapshots", () => {
    expect(matchesAny("runtime.snap.chat.abc", scope.sub.allow)).toBe(true)
  })

  test("runtime.runner.cmd.> is NOT in pub allow list (excluded by default)", () => {
    // NATS: not in allow list means denied. No explicit deny needed.
    expect(matchesAny("runtime.runner.cmd.A.start", scope.pub.allow)).toBe(false)
  })

  test("may NOT subscribe to runner cmd subjects (not in allow list)", () => {
    expect(matchesAny("runtime.runner.cmd.A.>", scope.sub.allow)).toBe(false)
  })

  test("no deny rules (allow-only policy)", () => {
    expect(scope.pub.deny).toHaveLength(0)
    expect(scope.sub.deny).toHaveLength(0)
  })
})

// ── runner (per-runnerId) ─────────────────────────────────────────────────────

describe("runner scope", () => {
  const runnerId = "runner-A"
  const otherRunnerId = "runner-B"
  const scope = permissionsFor({ class: "runner", runnerId })

  test("may subscribe to its own cmd subject", () => {
    expect(matchesAny(runnerCmdWildcard(runnerId), scope.sub.allow)).toBe(true)
    expect(matchesAny(`runtime.runner.cmd.${runnerId}.start`, scope.sub.allow)).toBe(true)
  })

  test("another runner cmd subject is NOT in sub allow (excluded by default)", () => {
    // NATS: not in allow list means denied. No explicit deny needed.
    expect(matchesAny(runnerCmdWildcard(otherRunnerId), scope.sub.allow)).toBe(false)
    expect(matchesAny(`runtime.runner.cmd.${otherRunnerId}.start`, scope.sub.allow)).toBe(false)
  })

  test("may publish its own heartbeat", () => {
    expect(matchesAny(`runtime.runner.heartbeat.${runnerId}`, scope.pub.allow)).toBe(true)
  })

  test("another runner heartbeat is NOT in pub allow (excluded by default)", () => {
    expect(matchesAny(`runtime.runner.heartbeat.${otherRunnerId}`, scope.pub.allow)).toBe(false)
  })

  test("may publish runner events", () => {
    expect(matchesAny("runtime.runner.evt.chat1", scope.pub.allow)).toBe(true)
  })

  test("may publish its own KV registry key", () => {
    const ownKey = runnerKvKeySubject(runnerId)
    expect(matchesAny(ownKey, scope.pub.allow)).toBe(true)
  })

  test("another runner KV key is NOT in pub allow (excluded by default)", () => {
    // NATS: not in allow means denied. We use specific-allow only (no wildcard allow,
    // no deny list) so other keys are automatically excluded.
    const foreignKey = runnerKvKeySubject(otherRunnerId)
    expect(matchesAny(foreignKey, scope.pub.allow)).toBe(false)
  })

  test("no deny rules (allow-only policy)", () => {
    expect(scope.pub.deny).toHaveLength(0)
    expect(scope.sub.deny).toHaveLength(0)
  })
})

// ── runnerKvKeySubject helper ─────────────────────────────────────────────────

describe("runnerKvKeySubject", () => {
  test("returns expected KV subject", () => {
    expect(runnerKvKeySubject("abc")).toBe("$KV.runtime_runner_registry.abc")
  })
})

describe("runnerCmdWildcard", () => {
  test("returns expected wildcard", () => {
    expect(runnerCmdWildcard("xyz")).toBe("runtime.runner.cmd.xyz.>")
  })
})

/**
 * Unit tests for RunnerRouter Stage 1.
 *
 * No NATS server — all tests exercise the pure functions `buildDescriptors`
 * and `selectFrom` directly. The KV-reading class methods (`list`, `get`,
 * `select`) are thin wrappers that compose these two pure functions; they are
 * covered by integration tests in later stages.
 */

import { describe, expect, test } from "bun:test"
import { buildDescriptors, eligibleFor, selectFrom } from "./runner-router"
import type { RunnerDescriptor } from "./runner-router"
import type { RunnerRegistration } from "../shared/runner-protocol"
import {
  LIVENESS_DEGRADED_MS,
  LIVENESS_OFFLINE_MS,
  SUPPORTED_RANGE,
} from "../shared/runner-protocol"
import type { AgentProvider } from "../shared/types"

// ── Helpers ──────────────────────────────────────────────────────────────────

const NOW = 1_000_000_000_000 // arbitrary fixed "now" ms

/** A fresh online registration (lastSeenAt = NOW - 1s, well within DEGRADED threshold). */
function makeReg(overrides: Partial<RunnerRegistration> = {}): RunnerRegistration {
  return {
    runnerId: "runner-a",
    pid: 1234,
    startedAt: NOW - 60_000,
    providers: ["claude"],
    protocolVersion: SUPPORTED_RANGE.min,
    lastSeenAt: NOW - 1_000, // 1 s ago → online
    ...overrides,
  }
}

function makeEntry(key: string, overrides: Partial<RunnerRegistration> = {}) {
  return { key, reg: makeReg({ runnerId: key, ...overrides }) }
}

// ── buildDescriptors ─────────────────────────────────────────────────────────

describe("buildDescriptors", () => {
  test("annotates state=online for a fresh runner", () => {
    const [d] = buildDescriptors([makeEntry("r1")], null, NOW)
    expect(d.state).toBe("online")
  })

  test("annotates state=degraded when lastSeenAt is between thresholds", () => {
    const age = LIVENESS_DEGRADED_MS + 1_000 // just past degraded threshold
    const [d] = buildDescriptors(
      [makeEntry("r1", { lastSeenAt: NOW - age })],
      null,
      NOW,
    )
    expect(d.state).toBe("degraded")
  })

  test("annotates state=offline when lastSeenAt is too old", () => {
    const age = LIVENESS_OFFLINE_MS + 1_000
    const [d] = buildDescriptors(
      [makeEntry("r1", { lastSeenAt: NOW - age })],
      null,
      NOW,
    )
    expect(d.state).toBe("offline")
  })

  test("annotates state=offline when lastSeenAt is null", () => {
    // lastSeenAt missing → treated as null → offline
    const entry = { key: "r1", reg: { ...makeReg(), lastSeenAt: undefined } as RunnerRegistration }
    const [d] = buildDescriptors([entry], null, NOW)
    expect(d.state).toBe("offline")
  })

  test("sets incompatible=false for a supported protocolVersion", () => {
    const [d] = buildDescriptors([makeEntry("r1", { protocolVersion: SUPPORTED_RANGE.min })], null, NOW)
    expect(d.incompatible).toBe(false)
  })

  test("sets incompatible=true when protocolVersion is outside range", () => {
    const [d] = buildDescriptors([makeEntry("r1", { protocolVersion: 999 })], null, NOW)
    expect(d.incompatible).toBe(true)
  })

  test("sets incompatible=true when protocolVersion is missing (defensive)", () => {
    const entry = {
      key: "r1",
      reg: { ...makeReg(), protocolVersion: undefined } as unknown as RunnerRegistration,
    }
    const [d] = buildDescriptors([entry], null, NOW)
    expect(d.incompatible).toBe(true)
  })

  test("sets capabilities from reg.capabilities when present", () => {
    const caps = { providers: ["claude"] as AgentProvider[] }
    const [d] = buildDescriptors(
      [makeEntry("r1", { capabilities: { providers: ["claude"] } })],
      null,
      NOW,
    )
    expect(d.capabilities).toEqual(caps)
  })

  test("sets capabilities=null when reg.capabilities is absent", () => {
    const entry = { key: "r1", reg: { ...makeReg(), capabilities: undefined } }
    const [d] = buildDescriptors([entry], null, NOW)
    expect(d.capabilities).toBeNull()
  })

  test("marks isShared=true when key matches sharedId", () => {
    const [d] = buildDescriptors([makeEntry("shared-runner")], "shared-runner", NOW)
    expect(d.isShared).toBe(true)
  })

  test("marks isShared=false when key does not match sharedId", () => {
    const [d] = buildDescriptors([makeEntry("r1")], "shared-runner", NOW)
    expect(d.isShared).toBe(false)
  })

  test("marks isShared=false when sharedId is null", () => {
    const [d] = buildDescriptors([makeEntry("r1")], null, NOW)
    expect(d.isShared).toBe(false)
  })

  test("reads ownerId defensively from reg", () => {
    const reg = { ...makeReg(), ownerId: "user-42" } as RunnerRegistration & { ownerId?: string }
    const [d] = buildDescriptors([{ key: "r1", reg }], null, NOW)
    expect(d.ownerId).toBe("user-42")
  })

  test("ownerId is null when absent", () => {
    const [d] = buildDescriptors([makeEntry("r1")], null, NOW)
    expect(d.ownerId).toBeNull()
  })

  test("returns empty array for empty entries", () => {
    expect(buildDescriptors([], null, NOW)).toEqual([])
  })

  test("builds multiple descriptors in entry order", () => {
    const entries = [makeEntry("r1"), makeEntry("r2"), makeEntry("r3")]
    const ds = buildDescriptors(entries, null, NOW)
    expect(ds.map((d) => d.runnerId)).toEqual(["r1", "r2", "r3"])
  })
})

// ── eligibleFor ──────────────────────────────────────────────────────────────

describe("eligibleFor", () => {
  function makeDescriptor(overrides: Partial<RunnerDescriptor> = {}): RunnerDescriptor {
    return {
      runnerId: "r1",
      state: "online",
      capabilities: null,
      protocolVersion: SUPPORTED_RANGE.min,
      incompatible: false,
      lastSeenAt: NOW - 1_000,
      pid: 1234,
      ownerId: null,
      isShared: false,
      ...overrides,
    }
  }

  test("online + compatible + null capabilities → eligible", () => {
    expect(eligibleFor("claude")(makeDescriptor())).toBe(true)
  })

  test("offline → not eligible", () => {
    expect(eligibleFor("claude")(makeDescriptor({ state: "offline" }))).toBe(false)
  })

  test("degraded → eligible (not offline)", () => {
    expect(eligibleFor("claude")(makeDescriptor({ state: "degraded" }))).toBe(true)
  })

  test("incompatible → not eligible", () => {
    expect(eligibleFor("claude")(makeDescriptor({ incompatible: true }))).toBe(false)
  })

  test("capabilities.providers includes provider → eligible", () => {
    const d = makeDescriptor({ capabilities: { providers: ["claude", "codex"] } })
    expect(eligibleFor("claude")(d)).toBe(true)
  })

  test("capabilities.providers excludes provider → not eligible", () => {
    const d = makeDescriptor({ capabilities: { providers: ["codex"] } })
    expect(eligibleFor("claude")(d)).toBe(false)
  })

  test("capabilities=null treated as capable (fail-open) for any provider", () => {
    expect(eligibleFor("codex")(makeDescriptor({ capabilities: null }))).toBe(true)
    expect(eligibleFor("claude")(makeDescriptor({ capabilities: null }))).toBe(true)
  })
})

// ── selectFrom ───────────────────────────────────────────────────────────────

describe("selectFrom", () => {
  /** Online, compatible, no-capabilities descriptor */
  function desc(
    id: string,
    overrides: Partial<RunnerDescriptor> = {},
  ): RunnerDescriptor {
    return {
      runnerId: id,
      state: "online",
      capabilities: null,
      protocolVersion: SUPPORTED_RANGE.min,
      incompatible: false,
      lastSeenAt: NOW - 1_000,
      pid: 1,
      ownerId: null,
      isShared: false,
      ...overrides,
    }
  }

  // ── sticky-hit ────────────────────────────────────────────────────────────

  test("sticky-hit: eligible preferred runner → selected with sticky=true", () => {
    const descriptors = [desc("r1"), desc("r2")]
    const result = selectFrom(descriptors, {
      provider: "claude",
      preferredRunnerId: "r1",
    })
    expect(result).toEqual({ kind: "selected", runnerId: "r1", sticky: true })
  })

  // ── sticky-offline ────────────────────────────────────────────────────────

  test("sticky-offline: preferred runner offline → needs_pick/sticky_offline", () => {
    const descriptors = [
      desc("r1", { state: "offline" }), // preferred but offline
      desc("r2"),                        // eligible alternative
    ]
    const result = selectFrom(descriptors, {
      provider: "claude",
      preferredRunnerId: "r1",
    })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.reason).toBe("sticky_offline")
      expect(result.candidates.map((c) => c.runnerId)).toContain("r2")
      expect(result.candidates.map((c) => c.runnerId)).not.toContain("r1")
    }
  })

  test("sticky-offline: preferred runner incompatible → needs_pick/sticky_offline", () => {
    const descriptors = [
      desc("r1", { incompatible: true }),
      desc("r2"),
    ]
    const result = selectFrom(descriptors, {
      provider: "claude",
      preferredRunnerId: "r1",
    })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") expect(result.reason).toBe("sticky_offline")
  })

  test("sticky-offline: preferred runner gone entirely → needs_pick/sticky_offline", () => {
    // "r-gone" is not in descriptors at all
    const descriptors = [desc("r2")]
    const result = selectFrom(descriptors, {
      provider: "claude",
      preferredRunnerId: "r-gone",
    })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.reason).toBe("sticky_offline")
      expect(result.candidates.map((c) => c.runnerId)).toEqual(["r2"])
    }
  })

  // ── sole-eligible ─────────────────────────────────────────────────────────

  test("sole-eligible: single eligible runner → selected with sticky=false", () => {
    const descriptors = [desc("r1")]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result).toEqual({ kind: "selected", runnerId: "r1", sticky: false })
  })

  test("sole-eligible: other runners offline/incompatible, one eligible → selected/!sticky", () => {
    const descriptors = [
      desc("r-offline", { state: "offline" }),
      desc("r-incompat", { incompatible: true }),
      desc("r-ok"),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result).toEqual({ kind: "selected", runnerId: "r-ok", sticky: false })
  })

  // ── shared-runner auto-select ─────────────────────────────────────────────

  test("shared-only: sole shared runner is auto-selected when no personal runner exists", () => {
    const descriptors = [desc("shared", { isShared: true })]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result).toEqual({ kind: "selected", runnerId: "shared", sticky: false })
  })

  // ── ambiguous ─────────────────────────────────────────────────────────────

  test("ambiguous: two eligible runners, no preference → needs_pick/ambiguous", () => {
    const descriptors = [desc("r1"), desc("r2")]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.reason).toBe("ambiguous")
      expect(result.candidates.length).toBe(2)
    }
  })

  test("ambiguous: three eligible runners → needs_pick/ambiguous with all candidates", () => {
    const descriptors = [desc("r1"), desc("r2"), desc("r3")]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.reason).toBe("ambiguous")
      expect(result.candidates.length).toBe(3)
    }
  })

  // ── unavailable ───────────────────────────────────────────────────────────

  test("none-eligible → unavailable with reason mentioning provider", () => {
    const result = selectFrom([], { provider: "claude" })
    expect(result.kind).toBe("unavailable")
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("claude")
    }
  })

  test("all offline → unavailable", () => {
    const descriptors = [
      desc("r1", { state: "offline" }),
      desc("r2", { state: "offline" }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("unavailable")
    if (result.kind === "unavailable") expect(result.reason).toContain("claude")
  })

  test("all incompatible → unavailable", () => {
    const descriptors = [
      desc("r1", { incompatible: true }),
      desc("r2", { incompatible: true }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("unavailable")
  })

  // ── capability filtering ──────────────────────────────────────────────────

  test("runner without claude capability is excluded for claude provider", () => {
    const descriptors = [
      desc("r-codex-only", { capabilities: { providers: ["codex"] } }),
      desc("r-claude", { capabilities: { providers: ["claude"] } }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result).toEqual({ kind: "selected", runnerId: "r-claude", sticky: false })
  })

  test("capabilities=null treated capable for any provider (fail-open)", () => {
    const descriptors = [desc("r1", { capabilities: null })]
    const result = selectFrom(descriptors, { provider: "codex" })
    expect(result).toEqual({ kind: "selected", runnerId: "r1", sticky: false })
  })

  // ── candidate ordering ────────────────────────────────────────────────────

  test("candidates: non-shared runners come before shared", () => {
    const descriptors = [
      desc("shared", { isShared: true, lastSeenAt: NOW - 500 }),
      desc("personal", { isShared: false, lastSeenAt: NOW - 1_000 }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    // Two eligible → ambiguous
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.candidates[0].runnerId).toBe("personal")
      expect(result.candidates[1].runnerId).toBe("shared")
    }
  })

  test("candidates: within non-shared group, sorted by lastSeenAt desc", () => {
    const descriptors = [
      desc("r-old", { lastSeenAt: NOW - 10_000 }),
      desc("r-new", { lastSeenAt: NOW - 500 }),
      desc("r-mid", { lastSeenAt: NOW - 5_000 }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.candidates.map((c) => c.runnerId)).toEqual(["r-new", "r-mid", "r-old"])
    }
  })

  test("candidates: shared runner comes after all non-shared, even if more recently seen", () => {
    const descriptors = [
      desc("shared", { isShared: true, lastSeenAt: NOW - 100 }), // most recent
      desc("personal-a", { lastSeenAt: NOW - 5_000 }),
      desc("personal-b", { lastSeenAt: NOW - 10_000 }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      const ids = result.candidates.map((c) => c.runnerId)
      expect(ids[ids.length - 1]).toBe("shared")
      expect(ids[0]).toBe("personal-a")
      expect(ids[1]).toBe("personal-b")
    }
  })

  test("candidates: nulls in lastSeenAt go last within their group", () => {
    const descriptors = [
      desc("r-null", { lastSeenAt: null }),
      desc("r-ts", { lastSeenAt: NOW - 1_000 }),
    ]
    const result = selectFrom(descriptors, { provider: "claude" })
    expect(result.kind).toBe("needs_pick")
    if (result.kind === "needs_pick") {
      expect(result.candidates[0].runnerId).toBe("r-ts")
      expect(result.candidates[1].runnerId).toBe("r-null")
    }
  })
})

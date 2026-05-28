import { describe, test, expect } from "bun:test"
import {
  filterRelevantRunners,
  newlyConnectedIds,
  runnerShortName,
  type HealthRunner,
} from "./runner-list"
import { resolveRunnerName, resolveRunnerMember, type RunnerLabel, type TeamMember } from "../../shared/runner-team-types"

function r(partial: Partial<HealthRunner> & { runnerId: string }): HealthRunner {
  return {
    state: "online",
    capabilities: { providers: ["claude"] },
    incompatible: false,
    lastSeenAt: 1000,
    pid: 1,
    isShared: false,
    ...partial,
  }
}

describe("filterRelevantRunners", () => {
  test("hides offline and incompatible tombstones", () => {
    const list = filterRelevantRunners([
      r({ runnerId: "a", state: "offline" }),
      r({ runnerId: "b", incompatible: true, state: "online" }),
      r({ runnerId: "c", state: "online" }),
      r({ runnerId: "d", state: "degraded" }),
    ])
    expect(list.map((x) => x.runnerId)).toEqual(["c", "d"])
  })

  test("sorts online before degraded, then by runnerId (stable across heartbeats)", () => {
    const list = filterRelevantRunners([
      r({ runnerId: "deg", state: "degraded", lastSeenAt: 5000 }),
      r({ runnerId: "online-b", state: "online", lastSeenAt: 100 }),
      r({ runnerId: "online-a", state: "online", lastSeenAt: 9000 }),
    ])
    expect(list.map((x) => x.runnerId)).toEqual(["online-a", "online-b", "deg"])
  })

  test("ordering is stable across heartbeat-only changes (lastSeenAt does not affect order)", () => {
    const beforeBeat = filterRelevantRunners([
      r({ runnerId: "alpha", state: "online", lastSeenAt: 1000 }),
      r({ runnerId: "bravo", state: "online", lastSeenAt: 1000 }),
    ])
    const afterBeat = filterRelevantRunners([
      // bravo just heartbeated, alpha hasn't — old code would put bravo first
      r({ runnerId: "alpha", state: "online", lastSeenAt: 1000 }),
      r({ runnerId: "bravo", state: "online", lastSeenAt: 9000 }),
    ])
    expect(beforeBeat.map((x) => x.runnerId)).toEqual(afterBeat.map((x) => x.runnerId))
  })

  test("empty in, empty out", () => {
    expect(filterRelevantRunners([])).toEqual([])
  })
})

describe("newlyConnectedIds", () => {
  test("flags ids absent from the baseline", () => {
    const baseline = new Set(["a", "b"])
    const current = [r({ runnerId: "a" }), r({ runnerId: "b" }), r({ runnerId: "c" })]
    expect([...newlyConnectedIds(baseline, current)]).toEqual(["c"])
  })

  test("no new ids → empty set", () => {
    const baseline = new Set(["a"])
    expect(newlyConnectedIds(baseline, [r({ runnerId: "a" })]).size).toBe(0)
  })

  test("empty baseline → every current id is new", () => {
    const current = [r({ runnerId: "x" }), r({ runnerId: "y" })]
    expect([...newlyConnectedIds(new Set(), current)]).toEqual(["x", "y"])
  })
})

describe("runnerShortName", () => {
  test("uses the last two segments", () => {
    expect(runnerShortName("runner-1779871760859-71677")).toBe("1779871760859-71677")
  })
  test("returns the whole id when it has no dash", () => {
    expect(runnerShortName("solo")).toBe("solo")
  })
})

describe("resolveRunnerName (US-RTN)", () => {
  const labels: RunnerLabel[] = [
    { runnerId: "runner-aaa-111", name: "Studio Mac", memberId: "m1", updatedAt: 1 },
    { runnerId: "runner-bbb-222", name: null, memberId: null, updatedAt: 1 },
    { runnerId: "runner-ccc-333", name: "   ", memberId: null, updatedAt: 1 },
  ]

  test("uses the operator label when set", () => {
    expect(resolveRunnerName("runner-aaa-111", labels)).toBe("Studio Mac")
  })
  test("falls back to short id when name is null", () => {
    expect(resolveRunnerName("runner-bbb-222", labels)).toBe("bbb-222")
  })
  test("falls back to short id when name is blank", () => {
    expect(resolveRunnerName("runner-ccc-333", labels)).toBe("ccc-333")
  })
  test("falls back to short id when no label exists", () => {
    expect(resolveRunnerName("runner-zzz-999", labels)).toBe("zzz-999")
  })
  test("accepts a Map as well as an array", () => {
    const map = new Map(labels.map((l) => [l.runnerId, l]))
    expect(resolveRunnerName("runner-aaa-111", map)).toBe("Studio Mac")
  })
})

describe("resolveRunnerMember (US-RTN)", () => {
  const labels: RunnerLabel[] = [
    { runnerId: "runner-aaa-111", name: "A", memberId: "m1", updatedAt: 1 },
    { runnerId: "runner-bbb-222", name: "B", memberId: null, updatedAt: 1 },
  ]
  const members: TeamMember[] = [{ id: "m1", name: "Alice" }]

  test("resolves the assigned member", () => {
    expect(resolveRunnerMember("runner-aaa-111", labels, members)).toEqual({ id: "m1", name: "Alice" })
  })
  test("returns null when unassigned", () => {
    expect(resolveRunnerMember("runner-bbb-222", labels, members)).toBeNull()
  })
  test("returns null when member no longer exists", () => {
    expect(resolveRunnerMember("runner-aaa-111", labels, [])).toBeNull()
  })
})

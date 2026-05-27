import { describe, test, expect } from "bun:test"
import {
  filterRelevantRunners,
  newlyConnectedIds,
  runnerShortName,
  type HealthRunner,
} from "./runner-list"

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

  test("sorts online before degraded, then by most-recently-seen", () => {
    const list = filterRelevantRunners([
      r({ runnerId: "deg", state: "degraded", lastSeenAt: 5000 }),
      r({ runnerId: "old", state: "online", lastSeenAt: 100 }),
      r({ runnerId: "new", state: "online", lastSeenAt: 9000 }),
    ])
    expect(list.map((x) => x.runnerId)).toEqual(["new", "old", "deg"])
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

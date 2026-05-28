import { afterEach, describe, expect, test } from "bun:test"
import { rm, mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventStore } from "./event-store"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-rt-"))
  tempDirs.push(dir)
  return dir
}

describe("EventStore runner team (US-RTN)", () => {
  test("saveTeamMember creates member", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()

    await store.saveTeamMember({ id: "m1", name: "Alice" })

    expect(store.state.teamMembers.get("m1")).toEqual({ id: "m1", name: "Alice" })
  })

  test("setRunnerLabel upserts name + assignment", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()

    await store.setRunnerLabel("runner-1", "Studio Mac", "m1")
    const first = store.state.runnerLabels.get("runner-1")!
    expect(first.name).toBe("Studio Mac")
    expect(first.memberId).toBe("m1")
    expect(first.updatedAt).toBeGreaterThan(0)

    await store.setRunnerLabel("runner-1", "Renamed", null)
    const second = store.state.runnerLabels.get("runner-1")!
    expect(second.name).toBe("Renamed")
    expect(second.memberId).toBeNull()
  })

  test("removeTeamMember cascades to unassign runners", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()

    await store.saveTeamMember({ id: "m1", name: "Alice" })
    await store.setRunnerLabel("runner-1", "Box A", "m1")
    await store.setRunnerLabel("runner-2", "Box B", "m1")
    await store.setRunnerLabel("runner-3", "Box C", "m2")

    await store.removeTeamMember("m1")

    expect(store.state.teamMembers.get("m1")).toBeUndefined()
    // runners that pointed at m1 are unassigned; their names are preserved.
    expect(store.state.runnerLabels.get("runner-1")!.memberId).toBeNull()
    expect(store.state.runnerLabels.get("runner-1")!.name).toBe("Box A")
    expect(store.state.runnerLabels.get("runner-2")!.memberId).toBeNull()
    // a runner assigned to a different member is untouched.
    expect(store.state.runnerLabels.get("runner-3")!.memberId).toBe("m2")
  })

  test("removeRunnerLabel deletes the label", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()

    await store.setRunnerLabel("runner-1", "Box A", null)
    await store.removeRunnerLabel("runner-1")

    expect(store.state.runnerLabels.get("runner-1")).toBeUndefined()
  })

  test("survive log replay without snapshot", async () => {
    const dataDir = await createTempDataDir()
    const store1 = new EventStore(dataDir)
    await store1.initialize()
    await store1.saveTeamMember({ id: "m1", name: "Alice" })
    await store1.setRunnerLabel("runner-1", "Studio Mac", "m1")

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    expect(store2.state.teamMembers.get("m1")?.name).toBe("Alice")
    expect(store2.state.runnerLabels.get("runner-1")?.name).toBe("Studio Mac")
    expect(store2.state.runnerLabels.get("runner-1")?.memberId).toBe("m1")
  })

  test("survive snapshot round-trip (compaction)", async () => {
    const dataDir = await createTempDataDir()
    const store1 = new EventStore(dataDir)
    await store1.initialize()
    await store1.saveTeamMember({ id: "m1", name: "Alice" })
    await store1.setRunnerLabel("runner-1", "Studio Mac", "m1")
    await store1.compact()

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    expect(store2.state.teamMembers.get("m1")?.name).toBe("Alice")
    expect(store2.state.runnerLabels.get("runner-1")?.memberId).toBe("m1")
  })
})

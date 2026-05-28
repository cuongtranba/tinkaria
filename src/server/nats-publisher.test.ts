import { afterEach, describe, test, expect, mock } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { createNatsPublisher, type CreateNatsPublisherArgs } from "./nats-publisher"
import { snapshotSubject, snapshotKvKey, KV_BUCKET } from "../shared/nats-subjects"
import { createEmptyState } from "./events"
import { Kvm } from "@nats-io/kv"
import type { SubscriptionTopic } from "../shared/protocol"

let server: NatsServer | null = null
let nc: NatsConnection | null = null

afterEach(async () => {
  if (nc) {
    await nc.drain()
    nc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
})

function mockArgs(overrides: Partial<CreateNatsPublisherArgs> = {}): CreateNatsPublisherArgs {
  return {
    nc: nc!,
    store: {
      state: createEmptyState(),
      getMessages: () => [],
    } as unknown as CreateNatsPublisherArgs["store"],
    agent: {
      getActiveStatuses: () => new Map(),
    } as unknown as CreateNatsPublisherArgs["agent"],
    terminals: {
      getSnapshot: () => null,
      onEvent: () => () => {},
    } as unknown as CreateNatsPublisherArgs["terminals"],
    refreshDiscovery: async () => [],
    getDiscoveredProjects: () => [],
    machineDisplayName: "test-machine",
    updateManager: null,
    ...overrides,
  }
}

async function collectMessages(sub: Subscription, count: number, timeoutMs = 500): Promise<string[]> {
  const messages: string[] = []
  const decoder = new TextDecoder()
  const timeout = setTimeout(() => sub.unsubscribe(), timeoutMs)

  for await (const msg of sub) {
    messages.push(decoder.decode(msg.data))
    if (messages.length >= count) {
      clearTimeout(timeout)
      sub.unsubscribe()
      break
    }
  }
  clearTimeout(timeout)
  return messages
}

describe("createNatsPublisher", () => {
  test("publishes snapshot to NATS subject", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }
    const sub = nc.subscribe(snapshotSubject(topic))

    publisher.addSubscription("sub-1", topic)
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)

    const data = JSON.parse(msgs[0])
    expect(data).toHaveProperty("workspaceGroups")

    publisher.dispose()
  })

  test("runner-teams snapshot derives members + runner labels (US-RTN)", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const args = mockArgs()
    args.store.state.teamMembers.set("m1", { id: "m1", name: "Alice" })
    args.store.state.runnerLabels.set("runner-1", { runnerId: "runner-1", name: "Studio Mac", memberId: "m1", updatedAt: 1 })

    const publisher = await createNatsPublisher(args)
    const topic: SubscriptionTopic = { type: "runner-teams" }
    const sub = nc.subscribe(snapshotSubject(topic))

    publisher.addSubscription("sub-rt", topic)
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)
    const data = JSON.parse(msgs[0]) as { members: unknown[]; runners: unknown[] }
    expect(data.members).toEqual([{ id: "m1", name: "Alice" }])
    expect(data.runners).toEqual([{ runnerId: "runner-1", name: "Studio Mac", memberId: "m1", updatedAt: 1 }])

    publisher.dispose()
  })

  test("dedup skips identical publishes", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }
    const sub = nc.subscribe(snapshotSubject(topic))

    // First publish delivers
    publisher.getSnapshot(topic)
    // Second publish with same data is skipped
    publisher.getSnapshot(topic)
    await nc.flush()

    const msgs = await collectMessages(sub, 2, 200)
    // Only 1 message should arrive due to dedup
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("writes snapshot to KV bucket", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }

    publisher.getSnapshot(topic)
    await nc.flush()
    // Give async KV put time to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    const kvm = new Kvm(nc)
    const kv = await kvm.create(KV_BUCKET)
    const entry = await kv.get(snapshotKvKey(topic))
    expect(entry).not.toBeNull()

    const data = entry!.json() as Record<string, unknown>
    expect(data).toHaveProperty("workspaceGroups")

    publisher.dispose()
  })

  test("broadcastSnapshots publishes for all active subscriptions", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())

    publisher.addSubscription("sub-1", { type: "sidebar" })
    publisher.addSubscription("sub-2", { type: "local-workspaces" })

    const sidebarSub = nc.subscribe(snapshotSubject({ type: "sidebar" }))
    const localProjectsSub = nc.subscribe(snapshotSubject({ type: "local-workspaces" }))

    publisher.broadcastSnapshots()

    const [sidebarMsgs, localProjectsMsgs] = await Promise.all([
      collectMessages(sidebarSub, 1),
      collectMessages(localProjectsSub, 1),
    ])

    expect(sidebarMsgs.length).toBe(1)
    expect(localProjectsMsgs.length).toBe(1)

    publisher.dispose()
  })

  test("broadcastSnapshots deduplicates same topic from multiple subscriptions", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())

    // Two subscriptions for same topic
    publisher.addSubscription("sub-1", { type: "sidebar" })
    publisher.addSubscription("sub-2", { type: "sidebar" })

    const sub = nc.subscribe(snapshotSubject({ type: "sidebar" }))

    publisher.broadcastSnapshots()
    await nc.flush()

    const msgs = await collectMessages(sub, 2, 200)
    // Only 1 publish even though 2 subscriptions watch sidebar
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("removeSubscription prunes dedup cache when last subscriber leaves", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }

    // Subscribe and get initial snapshot (seeds dedup cache)
    publisher.addSubscription("sub-1", topic)
    publisher.getSnapshot(topic)

    const sub = nc.subscribe(snapshotSubject(topic))

    // Remove subscription → dedup cache pruned
    publisher.removeSubscription("sub-1")

    // Re-subscribe → getSnapshot should publish again (cache was pruned)
    publisher.addSubscription("sub-2", topic)
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("terminal events forwarded via JetStream", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const eventCallbacks: Array<(event: unknown) => void> = []
    const terminals = {
      getSnapshot: () => null,
      onEvent: (cb: (event: unknown) => void) => {
        eventCallbacks.push(cb)
        return () => {}
      },
    } as unknown as CreateNatsPublisherArgs["terminals"]

    // Need the terminal events stream for JetStream publish
    const { ensureTerminalEventsStream } = await import("./nats-streams")
    await ensureTerminalEventsStream(nc)

    const publisher = await createNatsPublisher(mockArgs({ terminals }))

    const sub = nc.subscribe("runtime.evt.terminal.term-1")

    // Simulate terminal event
    for (const cb of eventCallbacks) {
      cb({ type: "terminal.output", terminalId: "term-1", data: "hello" })
    }

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)
    const event = JSON.parse(msgs[0])
    expect(event.terminalId).toBe("term-1")

    publisher.dispose()
  })

  test("failed publish does not poison dedup cache — retry delivers", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }
    const subject = snapshotSubject(topic)

    // Monkey-patch nc.publish to throw only for the snapshot subject
    const realPublish = nc.publish.bind(nc)
    let shouldFail = true
    nc.publish = (subj: string, ...rest: unknown[]) => {
      if (subj === subject && shouldFail) {
        shouldFail = false
        throw new Error("simulated max_payload exceeded")
      }
      return (realPublish as Function)(subj, ...rest)
    }

    // First getSnapshot — snapshot publish fails, cache should NOT be poisoned
    publisher.getSnapshot(topic)

    // Restore real publish and subscribe to verify retry
    nc.publish = realPublish
    const sub = nc.subscribe(subject)

    // Second getSnapshot with same data — should retry because cache was not poisoned
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("dispose stops terminal event forwarding", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const disposeFn = mock(() => {})
    const terminals = {
      getSnapshot: () => null,
      onEvent: () => disposeFn,
    } as unknown as CreateNatsPublisherArgs["terminals"]

    const publisher = await createNatsPublisher(mockArgs({ terminals }))
    publisher.dispose()

    expect(disposeFn).toHaveBeenCalledTimes(1)
  })

  test("broadcastSnapshots publishes orchestration snapshots without throwing", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(
      mockArgs({
        orchestrator: {
          getHierarchy: () => ({
            children: [
              {
                chatId: "child-1",
                provider: "claude",
                model: "sonnet",
                instruction: "audit the latest release candidate",
                status: "running",
                depth: 1,
                spawnedAt: Date.now(),
                lastStatusAt: Date.now(),
              },
            ],
          }),
          pruneTombstones: () => {},
        } as unknown as CreateNatsPublisherArgs["orchestrator"],
      })
    )

    const topic: SubscriptionTopic = { type: "orchestration", chatId: "chat-parent" }
    const sub = nc.subscribe(snapshotSubject(topic))

    publisher.addSubscription("sub-orch", topic)
    await expect(publisher.broadcastSnapshots()).resolves.toBeUndefined()

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)
    expect(JSON.parse(msgs[0])).toEqual({
      children: [
        expect.objectContaining({
          chatId: "child-1",
          status: "running",
          instruction: "audit the latest release candidate",
        }),
      ],
    })

    publisher.dispose()
  })
})

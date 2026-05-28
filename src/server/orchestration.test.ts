import { describe, expect, test, afterEach } from "bun:test"
import { createOrchestrationMcpServer, SessionOrchestrator } from "./orchestration"
import type { TranscriptEntry } from "../shared/types"
import type { CreateDelegationArgs } from "./delegation-coordinator"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  } as TranscriptEntry
}

// ---------------------------------------------------------------------------
// Fake store — supports multiple chats
// ---------------------------------------------------------------------------

interface FakeChat {
  id: string
  workspaceId: string
  title: string
  provider: "claude" | "codex" | null
  planMode: boolean
  sessionToken: string | null
}

function createFakeStore() {
  const chats = new Map<string, FakeChat>()
  const project = { id: "project-1", localPath: "/tmp/project" }
  const messagesByChatId = new Map<string, TranscriptEntry[]>()
  let chatCounter = 0

  return {
    chats,
    project,
    messagesByChatId,
    async createChat(workspaceId: string) {
      const id = `chat-${++chatCounter}`
      const chat: FakeChat = {
        id,
        workspaceId,
        title: "New Chat",
        provider: null,
        planMode: false,
        sessionToken: null,
      }
      chats.set(id, chat)
      messagesByChatId.set(id, [])
      return chat
    },
    requireChat(chatId: string) {
      const chat = chats.get(chatId)
      if (!chat) throw new Error(`Chat not found: ${chatId}`)
      return chat
    },
    getMessages(chatId: string) {
      return [...(messagesByChatId.get(chatId) ?? [])]
    },
    getProject() {
      return project
    },
    listChatsByProject() {
      return [...chats.values()]
    },
  }
}

// ---------------------------------------------------------------------------
// Fake coordinator — tracks calls, can simulate turn completion
// ---------------------------------------------------------------------------

function createFakeCoordinator() {
  const startedTurns: Array<{ chatId: string; content: string; delegatedContext?: string; isSpawned?: boolean; provider: string }> = []
  const queuedTurns: Array<{
    type: "chat.queue"
    chatId: string
    content: string
    provider?: string
    model?: string
    planMode?: boolean
  }> = []
  const activeTurns = new Map<string, unknown>()
  const cancelledChats: string[] = []
  const disposedChats: string[] = []

  return {
    startedTurns,
    queuedTurns,
    activeTurns,
    cancelledChats,
    disposedChats,
    getActiveStatuses(): Map<string, "idle" | "starting" | "running" | "waiting_for_user" | "failed"> {
      const statuses = new Map<string, "idle" | "starting" | "running" | "waiting_for_user" | "failed">()
      for (const [chatId] of activeTurns) {
        statuses.set(chatId, "running")
      }
      return statuses
    },
    async startTurnForChat(args: { chatId: string; content: string; delegatedContext?: string; isSpawned?: boolean; provider: string }) {
      startedTurns.push(args)
      activeTurns.set(args.chatId, { chatId: args.chatId })
    },
    async queue(args: {
      type: "chat.queue"
      chatId: string
      content: string
      provider?: string
      model?: string
      planMode?: boolean
    }) {
      queuedTurns.push(args)
      return { chatId: args.chatId, queued: true }
    },
    async cancel(chatId: string) {
      cancelledChats.push(chatId)
      activeTurns.delete(chatId)
    },
    async disposeChat(chatId: string) {
      disposedChats.push(chatId)
      activeTurns.delete(chatId)
    },
  }
}

// ---------------------------------------------------------------------------
// Fake delegation coordinator — tracks createDelegation calls
// ---------------------------------------------------------------------------

function createFakeDelegationCoordinator() {
  const createdDelegations: CreateDelegationArgs[] = []
  return {
    createdDelegations,
    async createDelegation(args: CreateDelegationArgs) {
      createdDelegations.push(args)
      return { delegationId: `del-${createdDelegations.length}` }
    },
    generateResumeHint(entries: TranscriptEntry[]) {
      return entries.length > 0 ? "generated-hint" : undefined
    },
    async initialize() {},
    async getDelegation() { return null },
    async getDelegationsForChild() { return [] },
    async getBlockingDelegationsForParent() { return [] },
    hasActiveBlockingDelegations() { return false },
    async reconcileChildTerminal() { return null },
    async bootReconciliation() {},
  }
}

// ---------------------------------------------------------------------------
// Factory for orchestrator under test
// ---------------------------------------------------------------------------

function createOrchestrator(overrides?: {
  maxDepth?: number
  maxConcurrency?: number
  delegationCoordinator?: ReturnType<typeof createFakeDelegationCoordinator>
}) {
  const store = createFakeStore()
  const coordinator = createFakeCoordinator()
  const delegationCoordinator = overrides?.delegationCoordinator
  const appendedMessages: Array<{ chatId: string; entry: TranscriptEntry }> = []

  let onMessageAppendedCallback: ((chatId: string, entry: TranscriptEntry) => void) | undefined

  const orchestrator = new SessionOrchestrator({
    store: store as never,
    coordinator: coordinator as never,
    delegationCoordinator: delegationCoordinator as never,
    onMessageAppended(chatId: string, entry: TranscriptEntry) {
      appendedMessages.push({ chatId, entry })
      onMessageAppendedCallback?.(chatId, entry)
    },
    maxDepth: overrides?.maxDepth,
    maxConcurrency: overrides?.maxConcurrency,
  })

  return {
    orchestrator,
    store,
    coordinator,
    delegationCoordinator,
    appendedMessages,
    /** Allow tests to hook into message delivery for simulating delayed results */
    setOnMessageAppended(cb: (chatId: string, entry: TranscriptEntry) => void) {
      onMessageAppendedCallback = cb
    },
    /** Simulate the target agent emitting a result entry */
    emitResult(chatId: string, result: string, isError = false) {
      const entry = timestamped({
        kind: "result" as const,
        subtype: isError ? ("error" as const) : ("success" as const),
        isError,
        durationMs: 100,
        result,
      })
      orchestrator.onMessageAppended(chatId, entry)
    },
  }
}

// ---------------------------------------------------------------------------
// Seed a caller chat in the fake store so orchestrator calls have a valid origin
// ---------------------------------------------------------------------------

async function seedCallerChat(store: ReturnType<typeof createFakeStore>, provider: "claude" | "codex" = "claude") {
  const chat = await store.createChat("project-1")
  chat.provider = provider
  return chat
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionOrchestrator", () => {
  let ctx: ReturnType<typeof createOrchestrator>

  afterEach(() => {
    ctx = undefined!
  })

  // =========================================================================
  // spawnAgent
  // =========================================================================

  describe("spawnAgent", () => {
    test("creates a new chat and records origin chain", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      const { chatId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Do the thing",
      })

      expect(chatId).toBeDefined()
      expect(typeof chatId).toBe("string")
      // The spawned chat should exist in the store
      const spawned = ctx.store.requireChat(chatId)
      expect(spawned).toBeDefined()
      expect(spawned.workspaceId).toBe("project-1")
    })

    test("passes instruction to startTurnForChat", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Write unit tests",
      })

      expect(ctx.coordinator.startedTurns).toHaveLength(1)
      expect(ctx.coordinator.startedTurns[0]!.content).toBe("Write unit tests")
    })

    test("fork_context seeds delegated context without rewriting the child instruction", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      ctx.store.messagesByChatId.set(caller.id, [
        timestamped({ kind: "user_prompt", content: "Investigate the auth race condition" }),
        timestamped({ kind: "assistant_text", text: "The race likely happens between session restore and token refresh." }),
        timestamped({ kind: "result", subtype: "success", isError: false, durationMs: 1, result: "Auth logs collected." }),
      ])

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Write the regression test",
        forkContext: true,
      })

      expect(ctx.coordinator.startedTurns).toHaveLength(1)
      expect(ctx.coordinator.startedTurns[0]!.content).toBe("Write the regression test")
      expect(ctx.coordinator.startedTurns[0]!.delegatedContext).toContain("Forked parent chat context:")
      expect(ctx.coordinator.startedTurns[0]!.delegatedContext).toContain("User: Investigate the auth race condition")
      expect(ctx.coordinator.startedTurns[0]!.delegatedContext).toContain("Assistant: The race likely happens between session restore and token refresh.")
      expect(ctx.coordinator.startedTurns[0]!.delegatedContext).toContain("Result: Auth logs collected.")
    })

    test("uses caller's provider by default", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store, "codex")

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Refactor module",
      })

      expect(ctx.coordinator.startedTurns[0]!.provider).toBe("codex")
    })

    test("allows explicit provider override", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store, "claude")

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Refactor module",
        provider: "codex",
      })

      expect(ctx.coordinator.startedTurns[0]!.provider).toBe("codex")
    })

    test("passes isSpawned flag to startTurnForChat", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "delegated work",
      })

      expect(ctx.coordinator.startedTurns).toHaveLength(1)
      expect(ctx.coordinator.startedTurns[0]!.isSpawned).toBe(true)
    })

    test("rejects when max concurrency (3) reached", async () => {
      ctx = createOrchestrator({ maxConcurrency: 3 })
      const caller = await seedCallerChat(ctx.store)

      // Spawn 3 agents (the default max)
      await ctx.orchestrator.spawnAgent(caller.id, { instruction: "task-1" })
      await ctx.orchestrator.spawnAgent(caller.id, { instruction: "task-2" })
      await ctx.orchestrator.spawnAgent(caller.id, { instruction: "task-3" })

      // The 4th should reject
      await expect(
        ctx.orchestrator.spawnAgent(caller.id, { instruction: "task-4" }),
      ).rejects.toThrow(/concurrency/i)
    })

    test("completed children no longer count toward concurrency", async () => {
      ctx = createOrchestrator({ maxConcurrency: 1 })
      const caller = await seedCallerChat(ctx.store)

      const child = await ctx.orchestrator.spawnAgent(caller.id, { instruction: "task-1" })
      ctx.coordinator.activeTurns.delete(child.chatId)

      await expect(
        ctx.orchestrator.spawnAgent(caller.id, { instruction: "task-2" }),
      ).resolves.toEqual({ chatId: expect.any(String) })
    })

    test("rejects when max depth (3) exceeded", async () => {
      ctx = createOrchestrator({ maxDepth: 3 })
      const caller = await seedCallerChat(ctx.store)

      // Build a chain: caller -> child1 -> child2 -> child3 (depth 3)
      const child1 = await ctx.orchestrator.spawnAgent(caller.id, { instruction: "depth-1" })
      const child2 = await ctx.orchestrator.spawnAgent(child1.chatId, { instruction: "depth-2" })
      const child3 = await ctx.orchestrator.spawnAgent(child2.chatId, { instruction: "depth-3" })

      // Depth 4 should reject
      await expect(
        ctx.orchestrator.spawnAgent(child3.chatId, { instruction: "depth-4" }),
      ).rejects.toThrow(/depth/i)
    })
  })

  // =========================================================================
  // sendInput
  // =========================================================================

  describe("sendInput", () => {
    test("calls startTurnForChat on target with content", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "initial",
      })

      // Clear started turns from spawn
      ctx.coordinator.startedTurns.length = 0
      // Remove from active so sendInput doesn't see it as running
      ctx.coordinator.activeTurns.delete(targetId)

      await ctx.orchestrator.sendInput(caller.id, {
        targetChatId: targetId,
        content: "follow-up message",
      })

      expect(ctx.coordinator.startedTurns).toHaveLength(1)
      expect(ctx.coordinator.startedTurns[0]!.chatId).toBe(targetId)
      expect(ctx.coordinator.startedTurns[0]!.content).toBe("follow-up message")
    })

    test("rejects if target chat does not exist", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      await expect(
        ctx.orchestrator.sendInput(caller.id, {
          targetChatId: "nonexistent-chat",
          content: "hello",
        }),
      ).rejects.toThrow(/not found|spawned agent/i)
    })

    test("queues input if target is already running", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "initial",
      })

      // Target is still in activeTurns from spawnAgent
      await expect(ctx.orchestrator.sendInput(caller.id, {
        targetChatId: targetId,
        content: "more input",
      })).resolves.toBeUndefined()

      expect(ctx.coordinator.startedTurns).toHaveLength(1)
      expect(ctx.coordinator.queuedTurns).toEqual([
        {
          type: "chat.queue",
          chatId: targetId,
          content: "more input",
          provider: "claude",
          model: "opus",
          planMode: false,
        },
      ])
    })

    test("rejects when caller does not own the target child", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const otherCaller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "initial",
      })

      ctx.coordinator.activeTurns.delete(targetId)

      await expect(
        ctx.orchestrator.sendInput(otherCaller.id, {
          targetChatId: targetId,
          content: "unauthorized follow-up",
        }),
      ).rejects.toThrow(/does not own/i)
    })
  })

  // =========================================================================
  // waitForResult
  // =========================================================================

  describe("waitForResult", () => {
    test("resolves when target emits result entry via onMessageAppended", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "compute something",
      })

      // Emit a result after a small delay
      setTimeout(() => ctx.emitResult(targetId, "computed value"), 50)

      const outcome = await ctx.orchestrator.waitForResult(caller.id, {
        targetChatId: targetId,
        timeoutMs: 2000,
      })

      expect(outcome.result).toBe("computed value")
      expect(outcome.isError).toBe(false)
    })

    test("returns result text and isError flag", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "do something risky",
      })

      // Emit an error result
      setTimeout(() => ctx.emitResult(targetId, "something went wrong", true), 50)

      const outcome = await ctx.orchestrator.waitForResult(caller.id, {
        targetChatId: targetId,
        timeoutMs: 2000,
      })

      expect(outcome.result).toBe("something went wrong")
      expect(outcome.isError).toBe(true)
    })

    test("times out after configured duration", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "slow task",
      })

      // No result emitted — should time out
      await expect(
        ctx.orchestrator.waitForResult(caller.id, {
          targetChatId: targetId,
          timeoutMs: 50,
        }),
      ).rejects.toThrow(/timeout|timed out/i)
    })

    test("cancels target turn on timeout", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "slow task",
      })

      try {
        await ctx.orchestrator.waitForResult(caller.id, {
          targetChatId: targetId,
          timeoutMs: 50,
        })
      } catch {
        // Expected to throw on timeout
      }

      expect(ctx.coordinator.cancelledChats).toContain(targetId)
    })

    test("rejects when caller does not own the waited child", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const otherCaller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "child work",
      })

      await expect(
        ctx.orchestrator.waitForResult(otherCaller.id, {
          targetChatId: targetId,
          timeoutMs: 50,
        }),
      ).rejects.toThrow(/does not own/i)
    })
  })

  // =========================================================================
  // closeAgent
  // =========================================================================

  describe("closeAgent", () => {
    test("disposes the target chat via coordinator", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "short-lived agent",
      })

      await ctx.orchestrator.closeAgent(caller.id, { targetChatId: targetId })

      expect(ctx.coordinator.disposedChats).toContain(targetId)
    })

    test("cleans up origin chain tracking after prune", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "temporary agent",
      })

      await ctx.orchestrator.closeAgent(caller.id, { targetChatId: targetId })
      ctx.orchestrator.pruneTombstones()

      // After prune, spawning again should not count toward the old concurrency
      const { chatId: newId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "replacement agent",
      })
      expect(newId).toBeDefined()
    })

    test("marks child as closed in hierarchy before disposing", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "closeable agent",
      })

      await ctx.orchestrator.closeAgent(caller.id, { targetChatId: targetId })

      // Hierarchy should show the child as "closed" (tombstone)
      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)
      expect(hierarchy.children).toHaveLength(1)
      expect(hierarchy.children[0]!.status).toBe("closed")
    })

    test("rejects when caller does not own the child being closed", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const otherCaller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "close me",
      })

      await expect(
        ctx.orchestrator.closeAgent(otherCaller.id, { targetChatId: targetId }),
      ).rejects.toThrow(/does not own/i)
    })

    test("pruneTombstones removes closed children", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "closeable agent",
      })

      await ctx.orchestrator.closeAgent(caller.id, { targetChatId: targetId })

      // Before prune
      expect(ctx.orchestrator.getHierarchy(caller.id).children).toHaveLength(1)

      // After prune
      ctx.orchestrator.pruneTombstones()
      expect(ctx.orchestrator.getHierarchy(caller.id).children).toHaveLength(0)
    })
  })

  // =========================================================================
  // circular detection
  // =========================================================================

  describe("circular detection", () => {
    test("rejects nested spawn when max depth is explicitly 1", async () => {
      ctx = createOrchestrator({ maxDepth: 1 })
      const chatA = await seedCallerChat(ctx.store)

      const { chatId: chatBId } = await ctx.orchestrator.spawnAgent(chatA.id, {
        instruction: "B's task",
      })

      await expect(
        ctx.orchestrator.spawnAgent(chatBId, {
          instruction: "nested child",
        }),
      ).rejects.toThrow(/depth|circular/i)
    })

    test("allows A->B, A->C (fan-out, no cycle)", async () => {
      ctx = createOrchestrator()
      const chatA = await seedCallerChat(ctx.store)

      const childB = await ctx.orchestrator.spawnAgent(chatA.id, {
        instruction: "B's task",
      })
      expect(childB.chatId).toBeDefined()

      const childC = await ctx.orchestrator.spawnAgent(chatA.id, {
        instruction: "C's task",
      })
      expect(childC.chatId).toBeDefined()

      // Both should succeed — fan-out is fine
      expect(childB.chatId).not.toBe(childC.chatId)
    })
  })

  // =========================================================================
  // cancelWithCascade
  // =========================================================================

  describe("cancelWithCascade", () => {
    test("cancelling parent cancels all children", async () => {
      ctx = createOrchestrator()
      const parent = await seedCallerChat(ctx.store)

      const childA = await ctx.orchestrator.spawnAgent(parent.id, {
        instruction: "child A",
      })
      const childB = await ctx.orchestrator.spawnAgent(parent.id, {
        instruction: "child B",
      })

      await ctx.orchestrator.cancelWithCascade(parent.id)

      expect(ctx.coordinator.cancelledChats).toContain(childA.chatId)
      expect(ctx.coordinator.cancelledChats).toContain(childB.chatId)
      expect(ctx.coordinator.cancelledChats).toContain(parent.id)
    })

    test("handles nested chains: A->B->C, cancel A cancels B and C", async () => {
      ctx = createOrchestrator({ maxDepth: 5 })
      const chatA = await seedCallerChat(ctx.store)

      const { chatId: chatBId } = await ctx.orchestrator.spawnAgent(chatA.id, {
        instruction: "B's task",
      })
      const { chatId: chatCId } = await ctx.orchestrator.spawnAgent(chatBId, {
        instruction: "C's task",
      })

      await ctx.orchestrator.cancelWithCascade(chatA.id)

      expect(ctx.coordinator.cancelledChats).toContain(chatA.id)
      expect(ctx.coordinator.cancelledChats).toContain(chatBId)
      expect(ctx.coordinator.cancelledChats).toContain(chatCId)
    })
  })

  // =========================================================================
  // destroy
  // =========================================================================

  describe("destroy", () => {
    test("rejects pending waiters and clears timers", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)
      const { chatId: targetId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "long-running task",
      })

      const waitPromise = ctx.orchestrator.waitForResult(caller.id, {
        targetChatId: targetId,
        timeoutMs: 60_000,
      })

      ctx.orchestrator.destroy()

      await expect(waitPromise).rejects.toThrow(/disposed/i)
    })

    test("allows new spawns after destroy + re-init", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      await ctx.orchestrator.spawnAgent(caller.id, { instruction: "pre-destroy" })
      ctx.orchestrator.destroy()

      // After destroy, origin tracking is cleared — new spawns should work
      const { chatId } = await ctx.orchestrator.spawnAgent(caller.id, { instruction: "post-destroy" })
      expect(chatId).toBeDefined()
    })
  })

  // =========================================================================
  // getHierarchy
  // =========================================================================

  describe("getHierarchy", () => {
    test("returns empty children when chat has no spawned agents", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy).toEqual({ children: [] })
    })

    test("returns children with status after spawnAgent", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      const { chatId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Do the thing",
      })

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy.children).toHaveLength(1)
      expect(hierarchy.children[0]!.chatId).toBe(chatId)
      expect(hierarchy.children[0]!.instruction).toBe("Do the thing")
      expect(hierarchy.children[0]!.spawnedAt).toBeGreaterThan(0)
      expect(hierarchy.children[0]!.children).toEqual([])
    })

    test("maps activeTurns starting/running to running status", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "task",
      })
      // The fake coordinator sets activeTurns on startTurnForChat,
      // so the child should be in activeTurns -> status should be "running"
      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy.children[0]!.status).toBe("running")
    })

    test("shows completed when child finishes (removed from activeTurns)", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      const { chatId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "quick task",
      })

      // Simulate turn completion: remove from activeTurns
      ctx.coordinator.activeTurns.delete(chatId)

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy.children[0]!.status).toBe("completed")
    })

    test("truncates instruction to 120 characters", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      const longInstruction = "A".repeat(200)
      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: longInstruction,
      })

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy.children[0]!.instruction).toHaveLength(120)
    })

    test("nested children rendered in hierarchy tree", async () => {
      ctx = createOrchestrator({ maxDepth: 3 })
      const caller = await seedCallerChat(ctx.store)

      const child1 = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "parent task",
      })
      const child2 = await ctx.orchestrator.spawnAgent(child1.chatId, {
        instruction: "nested task",
      })

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy.children).toHaveLength(1)
      expect(hierarchy.children[0]!.chatId).toBe(child1.chatId)
      expect(hierarchy.children[0]!.children).toHaveLength(1)
      expect(hierarchy.children[0]!.children[0]!.chatId).toBe(child2.chatId)
    })

    test("tracks codex-native subagent task entries in the hierarchy tree", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store, "codex")

      ctx.orchestrator.onMessageAppended(caller.id, timestamped({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "subagent_task",
          toolName: "Task",
          toolId: "agent-1",
          input: { subagentType: "spawnAgent" },
          rawInput: {
            type: "collabAgentToolCall",
            tool: "spawnAgent",
            status: "completed",
            receiverThreadIds: ["thread-2"],
            prompt: "Inspect tests",
            agentsStates: {
              "thread-2": { status: "running", message: "Inspecting" },
            },
          },
        },
      } as unknown as TranscriptEntry))

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)

      expect(hierarchy.children).toHaveLength(1)
      expect(hierarchy.children[0]!.chatId).toBe("thread-2")
      expect(hierarchy.children[0]!.externalSessionId).toBe("thread-2")
      expect(hierarchy.children[0]!.instruction).toBe("Inspect tests")
      expect(hierarchy.children[0]!.status).toBe("running")
    })

    test("updates codex-native subagent status from tool results", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store, "codex")

      ctx.orchestrator.onMessageAppended(caller.id, timestamped({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "subagent_task",
          toolName: "Task",
          toolId: "agent-1",
          input: { subagentType: "spawnAgent" },
          rawInput: {
            type: "collabAgentToolCall",
            tool: "spawnAgent",
            status: "completed",
            receiverThreadIds: ["thread-2"],
            prompt: "Inspect tests",
            agentsStates: {
              "thread-2": { status: "running", message: "Inspecting" },
            },
          },
        },
      } as unknown as TranscriptEntry))

      ctx.orchestrator.onMessageAppended(caller.id, timestamped({
        kind: "tool_result",
        toolId: "agent-1",
        isError: true,
        content: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "failed",
          receiverThreadIds: ["thread-2"],
          prompt: "Inspect tests",
          agentsStates: {
            "thread-2": { status: "failed", message: "Crashed" },
          },
        },
      }))

      const hierarchy = ctx.orchestrator.getHierarchy(caller.id)
      expect(hierarchy.children[0]!.status).toBe("failed")
    })
  })

  describe("createOrchestrationMcpServer", () => {
    test("registers spawn, list, send, wait, and close tools", async () => {
      ctx = createOrchestrator()
      const caller = await seedCallerChat(ctx.store)

      const server = createOrchestrationMcpServer(ctx.orchestrator, caller.id)
      const tools = Object.keys((server.instance as unknown as { _registeredTools: Record<string, unknown> })._registeredTools)

      expect(tools).toEqual([
        "spawn_agent",
        "list_agents",
        "send_input",
        "wait_agent",
        "close_agent",
      ])
    })
  })

  // =========================================================================
  // delegation
  // =========================================================================

  describe("delegation", () => {
    test("spawnAgent with blocking mode creates delegation via coordinator", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)

      const { chatId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Do blocking work",
        mode: "blocking",
        resume: "gate",
      })

      expect(dc.createdDelegations).toHaveLength(1)
      expect(dc.createdDelegations[0]!.parentChatId).toBe(caller.id)
      expect(dc.createdDelegations[0]!.childChatId).toBe(chatId)
      expect(dc.createdDelegations[0]!.mode).toBe("blocking")
      expect(dc.createdDelegations[0]!.resume).toBe("gate")
      expect(dc.createdDelegations[0]!.workspaceId).toBe("project-1")
    })

    test("spawnAgent defaults mode=blocking, resume=gate", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Default modes",
      })

      expect(dc.createdDelegations).toHaveLength(1)
      expect(dc.createdDelegations[0]!.mode).toBe("blocking")
      expect(dc.createdDelegations[0]!.resume).toBe("gate")
    })

    test("spawnAgent with background creates delegation with mode=background", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Fire and forget",
        mode: "background",
      })

      expect(dc.createdDelegations).toHaveLength(1)
      expect(dc.createdDelegations[0]!.mode).toBe("background")
    })

    test("spawnAgent generates resumeHint when not provided", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)
      // Seed transcript so generateResumeHint returns a value
      ctx.store.messagesByChatId.set(caller.id, [
        timestamped({ kind: "user_prompt", content: "Some parent context" }),
      ])

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Needs hint",
      })

      expect(dc.createdDelegations).toHaveLength(1)
      expect(dc.createdDelegations[0]!.resumeHint).toBe("generated-hint")
    })

    test("spawnAgent passes explicit resumeHint", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)
      ctx.store.messagesByChatId.set(caller.id, [
        timestamped({ kind: "user_prompt", content: "Some parent context" }),
      ])

      await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "Has explicit hint",
        resumeHint: "my-custom-hint",
      })

      expect(dc.createdDelegations).toHaveLength(1)
      expect(dc.createdDelegations[0]!.resumeHint).toBe("my-custom-hint")
    })

    test("spawnAgent without delegationCoordinator skips delegation creation", async () => {
      ctx = createOrchestrator() // no delegationCoordinator
      const caller = await seedCallerChat(ctx.store)

      const { chatId } = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "No coordinator",
      })

      // Should still work fine — just no delegation tracking
      expect(chatId).toBeDefined()
    })

    test("spawnAgent passes correct depth to delegation", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ maxDepth: 3, delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)

      const child1 = await ctx.orchestrator.spawnAgent(caller.id, {
        instruction: "depth-1",
      })
      await ctx.orchestrator.spawnAgent(child1.chatId, {
        instruction: "depth-2",
      })

      expect(dc.createdDelegations).toHaveLength(2)
      expect(dc.createdDelegations[0]!.depth).toBe(1)
      expect(dc.createdDelegations[1]!.depth).toBe(2)
    })

    test("spawn_agent MCP tool accepts mode + resume params", async () => {
      const dc = createFakeDelegationCoordinator()
      ctx = createOrchestrator({ delegationCoordinator: dc })
      const caller = await seedCallerChat(ctx.store)

      const server = createOrchestrationMcpServer(ctx.orchestrator, caller.id)
      // Call spawn_agent through MCP with mode + resume
      const result = await (server.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>
      })._registeredTools["spawn_agent"]!.handler({
        instruction: "MCP delegation task",
        mode: "background",
        resume: "immediate",
      })

      expect(dc.createdDelegations).toHaveLength(1)
      expect(dc.createdDelegations[0]!.mode).toBe("background")
      expect(dc.createdDelegations[0]!.resume).toBe("immediate")
      expect(result).toBeDefined()
    })
  })
})

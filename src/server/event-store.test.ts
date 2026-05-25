import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { TranscriptEntry } from "../shared/types"
import type { SnapshotFile } from "./events"
import { EventStore } from "./event-store"

const originalRuntimeProfile = process.env.TINKARIA_RUNTIME_PROFILE
const originalLegacyRuntimeProfile = process.env.KANNA_RUNTIME_PROFILE
const tempDirs: string[] = []

afterEach(async () => {
  if (originalRuntimeProfile === undefined) {
    delete process.env.TINKARIA_RUNTIME_PROFILE
  } else {
    process.env.TINKARIA_RUNTIME_PROFILE = originalRuntimeProfile
  }
  if (originalLegacyRuntimeProfile === undefined) {
    delete process.env.KANNA_RUNTIME_PROFILE
  } else {
    process.env.KANNA_RUNTIME_PROFILE = originalLegacyRuntimeProfile
  }

  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-event-store-"))
  tempDirs.push(dir)
  return dir
}

function entry(kind: "user_prompt" | "assistant_text", createdAt: number, extra: Record<string, unknown> = {}): TranscriptEntry {
  const base = { _id: `${kind}-${createdAt}`, createdAt }
  if (kind === "user_prompt") {
    return { ...base, kind, content: String(extra.content ?? "") }
  }
  return { ...base, kind, text: String(extra.content ?? extra.text ?? "") }
}

describe("EventStore", () => {
  test("uses the runtime profile for the default data dir", () => {
    process.env.TINKARIA_RUNTIME_PROFILE = "dev"
    delete process.env.KANNA_RUNTIME_PROFILE

    const store = new EventStore()

    expect(store.dataDir).toEndWith("/.tinkaria-dev/data")
  })

  test("migrates legacy snapshot and messages log transcripts into per-chat files", async () => {
    const dataDir = await createTempDataDir()
    const snapshotPath = join(dataDir, "snapshot.json")
    const messagesLogPath = join(dataDir, "messages.jsonl")
    const chatId = "chat-1"

    const snapshot: SnapshotFile = {
      v: 3,
      generatedAt: 10,
      workspaces: [{
        id: "project-1",
        localPath: "/tmp/project",
        title: "Project",
        createdAt: 1,
        updatedAt: 5,
      }],
      chats: [{
        id: chatId,
        workspaceId: "project-1",
    repoId: null,
        title: "Chat",
        createdAt: 1,
        updatedAt: 5,
        unread: false,
        provider: null,
        planMode: false,
        sessionToken: null,
        lastTurnOutcome: null,
      }],
      messages: [{
        chatId,
        entries: [
          entry("user_prompt", 100, { content: "hello" }),
        ],
      }],
    }

    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8")
    await writeFile(messagesLogPath, `${JSON.stringify({
      v: 3,
      type: "message_appended",
      timestamp: 101,
      chatId,
      entry: entry("assistant_text", 101, { content: "world" }),
    })}\n`, "utf8")

    const store = new EventStore(dataDir)
    await store.initialize()

    const progress: string[] = []
    const migrated = await store.migrateLegacyTranscripts((message) => {
      progress.push(message)
    })

    expect(migrated).toBe(true)
    expect(progress.some((message) => message.includes("transcript migration detected"))).toBe(true)
    expect(progress.at(-1)).toContain("transcript migration complete")
    expect(await store.getMessages(chatId)).toEqual([
      entry("user_prompt", 100, { content: "hello" }),
      entry("assistant_text", 101, { text: "world" }),
    ])

    const migratedSnapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as SnapshotFile
    expect(migratedSnapshot.messages).toBeUndefined()
    expect(await readFile(messagesLogPath, "utf8")).toBe("")
    expect(await readFile(join(dataDir, "transcripts", `${chatId}.jsonl`), "utf8")).toContain('"kind":"assistant_text"')
  })

  describe("getMessages pagination", () => {
    async function createStoreWithMessages(count: number) {
      const dataDir = await createTempDataDir()
      const store = new EventStore(dataDir)
      await store.initialize()

      const project = await store.openProject("/tmp/project")
      const chat = await store.createChat(project.id)
      for (let i = 0; i < count; i++) {
        await store.appendMessage(chat.id, entry("user_prompt", 1000 + i, { content: `msg-${i}` }))
      }
      return { store, chatId: chat.id }
    }

    test("returns first 50 messages with offset 0 limit 50", async () => {
      const { store, chatId } = await createStoreWithMessages(100)

      const page = await store.getMessages(chatId, { offset: 0, limit: 50 })

      expect(page).toHaveLength(50)
      expect((page[0] as { content: string }).content).toBe("msg-0")
      expect((page[49] as { content: string }).content).toBe("msg-49")
    })

    test("returns next 50 messages with offset 50 limit 50", async () => {
      const { store, chatId } = await createStoreWithMessages(100)

      const page = await store.getMessages(chatId, { offset: 50, limit: 50 })

      expect(page).toHaveLength(50)
      expect((page[0] as { content: string }).content).toBe("msg-50")
      expect((page[49] as { content: string }).content).toBe("msg-99")
    })

    test("returns remaining items when requesting beyond length", async () => {
      const { store, chatId } = await createStoreWithMessages(75)

      const page = await store.getMessages(chatId, { offset: 50, limit: 50 })

      expect(page).toHaveLength(25)
      expect((page[0] as { content: string }).content).toBe("msg-50")
      expect((page[24] as { content: string }).content).toBe("msg-74")
    })

    test("returns all messages when no pagination options provided (backward compat)", async () => {
      const { store, chatId } = await createStoreWithMessages(100)

      const all = await store.getMessages(chatId)

      expect(all).toHaveLength(100)
      expect((all[0] as { content: string }).content).toBe("msg-0")
      expect((all[99] as { content: string }).content).toBe("msg-99")
    })

    test("returns all messages when options is empty object", async () => {
      const { store, chatId } = await createStoreWithMessages(10)

      const all = await store.getMessages(chatId, {})

      expect(all).toHaveLength(10)
    })

    test("returns from offset to end when only offset is provided", async () => {
      const { store, chatId } = await createStoreWithMessages(10)

      const page = await store.getMessages(chatId, { offset: 7 })

      expect(page).toHaveLength(3)
      expect((page[0] as { content: string }).content).toBe("msg-7")
    })

    test("returns first N messages when only limit is provided", async () => {
      const { store, chatId } = await createStoreWithMessages(10)

      const page = await store.getMessages(chatId, { limit: 3 })

      expect(page).toHaveLength(3)
      expect((page[0] as { content: string }).content).toBe("msg-0")
      expect((page[2] as { content: string }).content).toBe("msg-2")
    })
  })

  test("createChat preserves a client-supplied chat id and reuses it idempotently", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    const project = await store.openProject("/tmp/project")
    const first = await store.createChat(project.id, undefined, "chat-optimistic-1")
    const second = await store.createChat(project.id, undefined, "chat-optimistic-1")

    expect(first.id).toBe("chat-optimistic-1")
    expect(second.id).toBe("chat-optimistic-1")
    expect(store.listChatsByProject(project.id)).toHaveLength(1)
  })

  test("appends new transcript entries only to the per-chat transcript file", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    const project = await store.openProject("/tmp/project")
    const chat = await store.createChat(project.id)
    await store.appendMessage(chat.id, entry("user_prompt", 200, { content: "hello" }))
    await store.appendMessage(chat.id, entry("assistant_text", 201, { content: "world" }))
    await store.compact()

    expect(await store.getMessages(chat.id)).toEqual([
      entry("user_prompt", 200, { content: "hello" }),
      entry("assistant_text", 201, { text: "world" }),
    ])
    expect(await readFile(join(dataDir, "messages.jsonl"), "utf8")).toBe("")

    const snapshot = JSON.parse(await readFile(join(dataDir, "snapshot.json"), "utf8")) as SnapshotFile
    expect(snapshot.messages).toBeUndefined()
    expect(existsSync(join(dataDir, "transcripts", `${chat.id}.jsonl`))).toBe(true)
  })

  test("persists chat model selections across reloads", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    const project = await store.openProject("/tmp/project")
    const chat = await store.createChat(project.id)
    await store.setChatProvider(chat.id, "codex")
    await store.setChatModel(chat.id, "gpt-5.4")

    const reloadedStore = new EventStore(dataDir)
    await reloadedStore.initialize()

    expect(reloadedStore.getChat(chat.id)?.provider).toBe("codex")
    expect(reloadedStore.getChat(chat.id)?.model).toBe("gpt-5.4")
  })

  test("persists queued chat turns across replay and clears them after drain", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    const project = await store.openProject("/tmp/project")
    const chat = await store.createChat(project.id)

    await store.enqueueQueuedTurn({
      chatId: chat.id,
      provider: "claude",
      content: "First follow-up",
      model: "sonnet",
    })
    await store.enqueueQueuedTurn({
      chatId: chat.id,
      content: "Second follow-up",
      model: "opus",
      planMode: true,
    })

    expect(store.getQueuedTurn(chat.id)).toMatchObject({
      chatId: chat.id,
      provider: "claude",
      content: "First follow-up\n\nSecond follow-up",
      model: "opus",
      planMode: true,
    })

    const replayed = new EventStore(dataDir)
    await replayed.initialize()
    expect(replayed.getQueuedTurn(chat.id)).toMatchObject({
      chatId: chat.id,
      content: "First follow-up\n\nSecond follow-up",
      model: "opus",
    })

    await replayed.clearQueuedTurn(chat.id)
    expect(replayed.getQueuedTurn(chat.id)).toBeNull()
  })
})

describe("independent workspace management", () => {
  test("rename updates the workspace name (trimmed)", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()
    const ws = await store.createIndependentWorkspace("alpha")
    await store.renameIndependentWorkspace(ws.id, "  renamed  ")
    expect(store.listIndependentWorkspaces().find((w) => w.id === ws.id)?.name).toBe("renamed")
  })

  test("pinning sorts a workspace to the top, unpinning restores order", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()
    const a = await store.createIndependentWorkspace("a")
    const b = await store.createIndependentWorkspace("b")
    const c = await store.createIndependentWorkspace("c")
    await store.setIndependentWorkspacePinned(c.id, true)
    expect(store.listIndependentWorkspaces().map((w) => w.id)).toEqual([c.id, a.id, b.id])
    await store.setIndependentWorkspacePinned(c.id, false)
    expect(store.listIndependentWorkspaces().map((w) => w.id)).toEqual([a.id, b.id, c.id])
  })

  test("reorder assigns sortOrder and persists across reload", async () => {
    const dir = await createTempDataDir()
    const store = new EventStore(dir)
    await store.initialize()
    const a = await store.createIndependentWorkspace("a")
    const b = await store.createIndependentWorkspace("b")
    const c = await store.createIndependentWorkspace("c")
    await store.reorderIndependentWorkspaces([c.id, a.id, b.id])
    expect(store.listIndependentWorkspaces().map((w) => w.id)).toEqual([c.id, a.id, b.id])

    const reloaded = new EventStore(dir)
    await reloaded.initialize()
    expect(reloaded.listIndependentWorkspaces().map((w) => w.id)).toEqual([c.id, a.id, b.id])
  })

  test("operations on an unknown workspace throw", async () => {
    const store = new EventStore(await createTempDataDir())
    await store.initialize()
    await expect(store.renameIndependentWorkspace("nope", "x")).rejects.toThrow("not found")
    await expect(store.setIndependentWorkspacePinned("nope", true)).rejects.toThrow("not found")
    const real = await store.createIndependentWorkspace("real")
    await expect(store.reorderIndependentWorkspaces([real.id, "nope"])).rejects.toThrow("not found")
  })
})

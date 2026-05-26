import { describe, expect, test } from "bun:test"
import {
  clearPendingSessionBootstrapAfterAttempt,
  enrichCommandError,
  fetchExternalSessionTranscript,
  fetchTranscriptMessageCount,
  fetchTranscriptRange,
  fetchTranscriptRenderUnits,
  filterPendingDeletedChats,
  MIN_TRANSCRIPT_FETCH_CHUNK_SIZE,
  normalizeSessionBootstrapErrorMessage,
  removeChatFromSidebar,
  shouldPreserveMessagesOnResubscribe,
  shouldTriggerSnapshotRecovery,
  transitionPendingSessionBootstrapToError,
  type PendingSessionBootstrap,
} from "./appState.helpers"
import type { SidebarData, SidebarChatRow } from "../../shared/types"
import type { AppTransport } from "./socket-interface"

function createTransportWithCommand(command: AppTransport["command"]): AppTransport {
  return {
    start() {},
    dispose() {},
    onStatus() { return () => {} },
    subscribe() { return () => {} },
    subscribeTerminal() { return () => {} },
    command,
    rawRequest: async () => ({}) as never,
    rawSubscribe: () => () => {},
    ensureHealthyConnection: async () => {},
  }
}

function createMockGetMessagesCommand(
  handler: (command: Extract<Parameters<AppTransport["command"]>[0], { type: "chat.getMessages" }>) => Promise<unknown>
): AppTransport["command"] {
  return async <TResult = unknown>(command: Parameters<AppTransport["command"]>[0]) => {
    if (command.type !== "chat.getMessages") {
      throw new Error(`Unexpected command ${command.type}`)
    }
    return await handler(command) as TResult
  }
}

function createMockGetMessageCountCommand(
  handler: (command: Extract<Parameters<AppTransport["command"]>[0], { type: "chat.getMessageCount" }>) => Promise<unknown>
): AppTransport["command"] {
  return async <TResult = unknown>(command: Parameters<AppTransport["command"]>[0]) => {
    if (command.type !== "chat.getMessageCount") {
      throw new Error(`Unexpected command ${command.type}`)
    }
    return await handler(command) as TResult
  }
}

function createMockGetRenderUnitsCommand(
  handler: (command: Extract<Parameters<AppTransport["command"]>[0], { type: "chat.getRenderUnits" }>) => Promise<unknown>
): AppTransport["command"] {
  return async <TResult = unknown>(command: Parameters<AppTransport["command"]>[0]) => {
    if (command.type !== "chat.getRenderUnits") {
      throw new Error(`Unexpected command ${command.type}`)
    }
    return await handler(command) as TResult
  }
}

function createMockGetExternalSessionMessagesCommand(
  handler: (command: Extract<Parameters<AppTransport["command"]>[0], { type: "chat.getExternalSessionMessages" }>) => Promise<unknown>
): AppTransport["command"] {
  return async <TResult = unknown>(command: Parameters<AppTransport["command"]>[0]) => {
    if (command.type !== "chat.getExternalSessionMessages") {
      throw new Error(`Unexpected command ${command.type}`)
    }
    return await handler(command) as TResult
  }
}

function pendingBootstrap(kind: PendingSessionBootstrap["kind"], phase: PendingSessionBootstrap["phase"]): PendingSessionBootstrap {
  return {
    chatId: "chat-target",
    kind,
    phase,
    sourceLabels: kind === "fork" ? ["Source"] : ["Source A", "Source B"],
    previewTitle: kind === "fork" ? "Fork: Source" : "Merge: Source A + Source B",
    previewIntent: kind === "fork" ? "Investigate the timeout." : "Combine the verified findings.",
  }
}

describe("transitionPendingSessionBootstrapToError", () => {
  test("marks fork bootstrap failures as sticky errors for the active chat", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("fork", "starting"),
      "chat-target",
      "Fork failed upstream",
    )).toEqual({
      chatId: "chat-target",
      kind: "fork",
      phase: "error",
      sourceLabels: ["Source"],
      previewTitle: "Fork: Source",
      previewIntent: "Investigate the timeout.",
      errorMessage: "Fork failed upstream",
    })
  })

  test("marks merge bootstrap failures as sticky errors for the active chat", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("merge", "starting"),
      "chat-target",
      "Merge failed upstream",
    )).toEqual({
      chatId: "chat-target",
      kind: "merge",
      phase: "error",
      sourceLabels: ["Source A", "Source B"],
      previewTitle: "Merge: Source A + Source B",
      previewIntent: "Combine the verified findings.",
      errorMessage: "Merge failed upstream",
    })
  })

  test("ignores failures from other chats", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("merge", "starting"),
      "chat-other",
      "should be ignored",
    )).toEqual(pendingBootstrap("merge", "starting"))
  })
})

describe("clearPendingSessionBootstrapAfterAttempt", () => {
  test("clears successful fork bootstrap placeholders", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      pendingBootstrap("fork", "starting"),
      "chat-target",
    )).toBeNull()
  })

  test("keeps failed merge bootstrap errors visible until dismissal", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      {
        ...pendingBootstrap("merge", "error"),
        errorMessage: "Merge failed upstream",
      },
      "chat-target",
    )).toEqual({
      chatId: "chat-target",
      kind: "merge",
      phase: "error",
      sourceLabels: ["Source A", "Source B"],
      previewTitle: "Merge: Source A + Source B",
      previewIntent: "Combine the verified findings.",
      errorMessage: "Merge failed upstream",
    })
  })

  test("ignores cleanup for other chats", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      pendingBootstrap("fork", "compacting"),
      "chat-other",
    )).toEqual(pendingBootstrap("fork", "compacting"))
  })
})

function chatRow(chatId: string, title = `Chat ${chatId}`): SidebarChatRow {
  return {
    _id: chatId,
    _creationTime: 1,
    chatId,
    title,
    status: "idle",
    unread: false,
    localPath: "/tmp/project",
    provider: "claude",
    hasAutomation: false,
  }
}

function sidebarWith(...groups: Array<{ key: string; chats: SidebarChatRow[] }>): SidebarData {
  return {
    independentWorkspaces: [],
    workspaceGroups: groups.map((g) => ({
      groupKey: g.key,
      localPath: `/tmp/${g.key}`,
      chats: g.chats,
    })),
  }
}

describe("removeChatFromSidebar", () => {
  test("removes the target chat from its project group", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("a"), chatRow("b"), chatRow("c")] })
    const result = removeChatFromSidebar(data, "b")
    expect(result.workspaceGroups[0].chats.map((c) => c.chatId)).toEqual(["a", "c"])
  })

  test("removes empty project groups after the last chat is deleted", () => {
    const data = sidebarWith(
      { key: "p1", chats: [chatRow("only")] },
      { key: "p2", chats: [chatRow("other")] },
    )
    const result = removeChatFromSidebar(data, "only")
    expect(result.workspaceGroups).toHaveLength(1)
    expect(result.workspaceGroups[0].groupKey).toBe("p2")
  })

  test("returns identical data when chatId is not found", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("a")] })
    const result = removeChatFromSidebar(data, "nonexistent")
    expect(result).toEqual(data)
  })

  test("handles multiple project groups, only removing from the correct one", () => {
    const data = sidebarWith(
      { key: "p1", chats: [chatRow("a"), chatRow("b")] },
      { key: "p2", chats: [chatRow("c"), chatRow("d")] },
    )
    const result = removeChatFromSidebar(data, "c")
    expect(result.workspaceGroups[0].chats.map((c) => c.chatId)).toEqual(["a", "b"])
    expect(result.workspaceGroups[1].chats.map((c) => c.chatId)).toEqual(["d"])
  })
})

describe("shouldTriggerSnapshotRecovery", () => {
  test("triggers recovery when snapshot never arrived and fetch never started", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: false,
      initialFetchDone: false,
      fetchTriggered: false,
    })).toBe(true)
  })

  test("does not trigger if cancelled", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: true,
      initialFetchDone: false,
      fetchTriggered: false,
    })).toBe(false)
  })

  test("does not trigger if initial fetch already completed", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: false,
      initialFetchDone: true,
      fetchTriggered: false,
    })).toBe(false)
  })

  test("does not trigger if fetch was already triggered", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: false,
      initialFetchDone: false,
      fetchTriggered: true,
    })).toBe(false)
  })
})

describe("enrichCommandError", () => {
  test("enriches 'not connected' with server hint and dismiss action", () => {
    const result = enrichCommandError("not connected")
    expect(result.message).toBe("Can't reach the server")
    expect(result.hint).toBe("Make sure Tinkaria is running on this machine.")
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })

  test("enriches connection closed with reconnecting hint", () => {
    const result = enrichCommandError("WebSocket connection closed unexpectedly")
    expect(result.message).toBe("Connection dropped")
    expect(result.hint).toBe("Reconnecting automatically...")
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })

  test("enriches socket closed with reconnecting hint", () => {
    const result = enrichCommandError("socket closed")
    expect(result.message).toBe("Connection dropped")
  })

  test("enriches version mismatch with restart hint", () => {
    const result = enrichCommandError("Unknown command type: system.readLocalFilePreview")
    expect(result.message).toBe("Client is newer than server")
    expect(result.hint).toBe("Restart Tinkaria to enable in-app file previews.")
  })

  test("passes through unknown errors with no hint", () => {
    const result = enrichCommandError("Something weird happened")
    expect(result.message).toBe("Something weird happened")
    expect(result.hint).toBeUndefined()
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })
})

describe("fetchTranscriptRange", () => {
  test("returns the requested range in one request when payload fits", async () => {
    const commandCalls: Array<{ offset?: number; limit?: number }> = []
    const socket = createTransportWithCommand(createMockGetMessagesCommand(async (command) => {
        commandCalls.push({ offset: command.offset, limit: command.limit })
        return [{ kind: "assistant_text", createdAt: 1, messageId: "m1", text: "ok" }]
      }))

    const result = await fetchTranscriptRange({
      socket,
      chatId: "chat-1",
      offset: 5,
      limit: 1,
    })

    expect(result).toHaveLength(1)
    expect(commandCalls).toEqual([{ offset: 5, limit: 1 }])
  })

  test("halves chunk size and retries when a range exceeds payload limits", async () => {
    const commandCalls: Array<{ offset?: number; limit?: number }> = []
    const socket = createTransportWithCommand(createMockGetMessagesCommand(async (command) => {
        commandCalls.push({ offset: command.offset, limit: command.limit })
        if ((command.limit ?? 0) > 2) {
          throw new Error("'payload' max_payload size exceeded")
        }
        return Array.from({ length: command.limit ?? 0 }, (_, index) => ({
          kind: "assistant_text" as const,
          createdAt: (command.offset ?? 0) + index,
          messageId: `m-${(command.offset ?? 0) + index}`,
          text: `chunk-${(command.offset ?? 0) + index}`,
        }))
      }))

    const result = await fetchTranscriptRange({
      socket,
      chatId: "chat-1",
      offset: 0,
      limit: 5,
    })

    expect(result).toHaveLength(5)
    expect(commandCalls).toEqual([
      { offset: 0, limit: 5 },
      { offset: 0, limit: 2 },
      { offset: 2, limit: 2 },
      { offset: 4, limit: 1 },
    ])
  })

  test("rethrows payload errors once the request is already at the minimum chunk size", async () => {
    const socket = createTransportWithCommand(createMockGetMessagesCommand(async () => {
      throw new Error("'payload' max_payload size exceeded")
    }))

    await expect(fetchTranscriptRange({
      socket,
      chatId: "chat-1",
      offset: 0,
      limit: MIN_TRANSCRIPT_FETCH_CHUNK_SIZE,
    })).rejects.toThrow(/max_payload/i)
  })
})

describe("fetchTranscriptMessageCount", () => {
  test("returns the message count for chats without an active snapshot", async () => {
    const socket = createTransportWithCommand(createMockGetMessageCountCommand(async (command) => {
      expect(command.chatId).toBe("chat-1")
      return { messageCount: 7 }
    }))

    await expect(fetchTranscriptMessageCount({
      socket,
      chatId: "chat-1",
    })).resolves.toBe(7)
  })
})

describe("fetchTranscriptRenderUnits", () => {
  test("requests ready-to-render units with window and loading state", async () => {
    const socket = createTransportWithCommand(createMockGetRenderUnitsCommand(async (command) => {
      expect(command).toEqual({
        type: "chat.getRenderUnits",
        chatId: "chat-1",
        offset: 10,
        limit: 20,
        isLoading: true,
      })
      return [{
        id: "assistant_response:e1",
        kind: "assistant_response",
        sourceEntryIds: ["e1"],
        message: {
          id: "e1",
          kind: "assistant_text",
          timestamp: new Date(1).toISOString(),
          text: "Ready",
        },
      }]
    }))

    const result = await fetchTranscriptRenderUnits({
      socket,
      chatId: "chat-1",
      offset: 10,
      limit: 20,
      isLoading: true,
    })

    expect(result.map((unit) => unit.id)).toEqual(["assistant_response:e1"])
  })
})

describe("fetchExternalSessionTranscript", () => {
  test("returns transcript entries for an external provider session", async () => {
    const socket = createTransportWithCommand(createMockGetExternalSessionMessagesCommand(async (command) => {
      expect(command.parentChatId).toBe("chat-1")
      expect(command.sessionId).toBe("thread-2")
      return [{ _id: "entry-1", kind: "assistant_text", createdAt: 1, messageId: "m1", text: "done" }]
    }))

    await expect(fetchExternalSessionTranscript({
      socket,
      parentChatId: "chat-1",
      sessionId: "thread-2",
    })).resolves.toEqual([
      { _id: "entry-1", kind: "assistant_text", createdAt: 1, messageId: "m1", text: "done" },
    ])
  })
})

describe("normalizeSessionBootstrapErrorMessage", () => {
  test("returns busy hint when error contains 'busy'", () => {
    const result = normalizeSessionBootstrapErrorMessage("fork", "Target chat is busy")
    expect(result).toBe("The target session is currently busy. Wait for it to finish or pick a different session.")
  })

  test("returns busy hint when error contains 'already running'", () => {
    const result = normalizeSessionBootstrapErrorMessage("merge", "Session already running")
    expect(result).toBe("The target session is currently busy. Wait for it to finish or pick a different session.")
  })

  test("returns timeout hint for fork", () => {
    const result = normalizeSessionBootstrapErrorMessage("fork", "Request timed out")
    expect(result).toBe("Preparing the fork brief took too long. Try again with a tighter focus or a smaller source context.")
  })

  test("returns timeout hint for merge", () => {
    const result = normalizeSessionBootstrapErrorMessage("merge", "Operation timeout")
    expect(result).toBe("Preparing the merged session brief took too long. Try again with fewer sessions or a tighter goal.")
  })
})

describe("shouldPreserveMessagesOnResubscribe", () => {
  test("preserves messages only when they already belong to the active chat", () => {
    expect(shouldPreserveMessagesOnResubscribe({
      hasExistingMessages: true,
      restoredFromCache: false,
      currentMessagesChatId: "chat-1",
      nextChatId: "chat-1",
    })).toBe(true)
  })

  test("does not preserve when the next chat differs from the current transcript owner", () => {
    expect(shouldPreserveMessagesOnResubscribe({
      hasExistingMessages: true,
      restoredFromCache: false,
      currentMessagesChatId: "chat-old",
      nextChatId: "chat-new",
    })).toBe(false)
  })

  test("does not preserve when no existing messages or cache already restored", () => {
    expect(shouldPreserveMessagesOnResubscribe({
      hasExistingMessages: false,
      restoredFromCache: false,
      currentMessagesChatId: "chat-1",
      nextChatId: "chat-1",
    })).toBe(false)

    expect(shouldPreserveMessagesOnResubscribe({
      hasExistingMessages: true,
      restoredFromCache: true,
      currentMessagesChatId: "chat-1",
      nextChatId: "chat-1",
    })).toBe(false)
  })
})

describe("filterPendingDeletedChats", () => {
  test("returns same reference when pending set is empty", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("chat-1"), chatRow("chat-2")] })
    expect(filterPendingDeletedChats(data, new Set())).toBe(data)
  })

  test("filters out chats whose ids are in the pending set", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("chat-1"), chatRow("chat-2"), chatRow("chat-3")] })
    const result = filterPendingDeletedChats(data, new Set(["chat-2"]))
    const allChatIds = result.workspaceGroups.flatMap((g) => g.chats.map((c) => c.chatId))
    expect(allChatIds).toEqual(["chat-1", "chat-3"])
  })

  test("removes empty groups after filtering", () => {
    const data = sidebarWith(
      { key: "solo", chats: [chatRow("chat-solo")] },
      { key: "other", chats: [chatRow("chat-other")] },
    )
    const result = filterPendingDeletedChats(data, new Set(["chat-solo"]))
    expect(result.workspaceGroups).toHaveLength(1)
    expect(result.workspaceGroups[0].groupKey).toBe("other")
  })

  test("filters across multiple groups", () => {
    const data = sidebarWith(
      { key: "p1", chats: [chatRow("a"), chatRow("b")] },
      { key: "p2", chats: [chatRow("c"), chatRow("d")] },
    )
    const result = filterPendingDeletedChats(data, new Set(["b", "c"]))
    expect(result.workspaceGroups[0].chats.map((c) => c.chatId)).toEqual(["a"])
    expect(result.workspaceGroups[1].chats.map((c) => c.chatId)).toEqual(["d"])
  })

  test("returns same reference when no chats match the pending set", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("chat-1")] })
    expect(filterPendingDeletedChats(data, new Set(["nonexistent"]))).toBe(data)
  })
})

import { describe, expect, test } from "bun:test"
import { processTranscriptMessages, createIncrementalHydrator } from "./parseTranscript"
import { getLatestToolIds } from "../app/derived"
import type { TranscriptEntry, TranscriptRenderUnit } from "../../shared/types"

let entryCounter = 0
function entry(partial: Omit<TranscriptEntry, "_id" | "createdAt">): TranscriptEntry {
  entryCounter++
  return {
    _id: `entry-${entryCounter}-${crypto.randomUUID()}`,
    createdAt: Date.now() + entryCounter,
    ...partial,
  } as TranscriptEntry
}

describe("processTranscriptMessages", () => {
  test("hydrates tool results onto prior tool calls", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "bash",
          toolName: "Bash",
          toolId: "tool-1",
          input: { command: "pwd" },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-1",
        content: "/Users/jake/Projects/kanna\n",
      }),
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toBe("/Users/jake/Projects/kanna\n")
  })

  test("hydrates ask-user-question results with typed answers", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "ask_user_question",
          toolName: "AskUserQuestion",
          toolId: "tool-2",
          input: {
            questions: [{ question: "Provider?" }],
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-2",
        content: { answers: { "Provider?": ["Codex"] } },
      }),
    ])

    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toEqual({ answers: { "Provider?": ["Codex"] } })
  })

  test("hydrates discarded prompt tool results", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "exit_plan_mode",
          toolName: "ExitPlanMode",
          toolId: "tool-3",
          input: {
            plan: "## Plan",
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-3",
        content: { discarded: true },
      }),
    ])

    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toEqual({ discarded: true })
  })

  test("preserves structured Claude ask-user-question results when a later echoed tool result arrives", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "ask_user_question",
          toolName: "AskUserQuestion",
          toolId: "tool-3",
          input: {
            questions: [{ question: "Provider?" }],
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-3",
        content: { answers: { "Provider?": ["Codex"] } },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-3",
        content: "User has answered your questions: \"Provider?\"=\"Codex\".",
        debugRaw: JSON.stringify({
          type: "user",
          tool_use_result: {
            questions: [{ question: "Provider?" }],
            answers: { "Provider?": "Codex" },
          },
        }),
      }),
    ])

    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toEqual({ answers: { "Provider?": ["Codex"] } })
  })

  test("preserves structured ask-user-question results when SDK echo lacks debugRaw", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "ask_user_question",
          toolName: "AskUserQuestion",
          toolId: "tool-no-debug",
          input: {
            questions: [{ question: "Provider?" }],
          },
        },
      }),
      // First: runner-published structured result
      entry({
        kind: "tool_result",
        toolId: "tool-no-debug",
        content: { answers: { "Provider?": ["Codex"] } },
      }),
      // Second: SDK-echoed result without debugRaw (production mode)
      entry({
        kind: "tool_result",
        toolId: "tool-no-debug",
        content: "User has answered your questions: \"Provider?\"=\"Codex\".",
      }),
    ])

    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toEqual({ answers: { "Provider?": ["Codex"] } })
  })

  test("hydrates present_content tool results as structured data", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "present_content",
          toolName: "present_content",
          toolId: "tool-pc-1",
          input: {
            title: "Snippet",
            kind: "code",
            format: "typescript",
            source: "const x = 1",
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-pc-1",
        content: {
          accepted: true,
          title: "Snippet",
          kind: "code",
          format: "typescript",
          source: "const x = 1",
          summary: "Context",
          collapsed: false,
        },
      }),
    ])

    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toEqual({
      accepted: true,
      title: "Snippet",
      kind: "code",
      format: "typescript",
      source: "const x = 1",
      summary: "Context",
      collapsed: false,
    })
  })

  test("preserves present_content error tool results", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "present_content",
          toolName: "present_content",
          toolId: "tool-pc-2",
          input: {
            title: "Snippet",
            kind: "code",
            format: "typescript",
            source: "const x = 1",
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-pc-2",
        content: {
          error: {
            source: "schema_validation",
            schema: "present_content",
            issues: [
              {
                path: ["summary"],
                code: "invalid_type",
                message: "Invalid input: expected string, received number",
              },
            ],
          },
        },
      }),
    ])

    expect(messages[0]?.kind).toBe("tool")
    if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
    expect(messages[0].result).toEqual({
      error: {
        source: "schema_validation",
        schema: "present_content",
        issues: [
          {
            path: ["summary"],
            code: "invalid_type",
            message: "Invalid input: expected string, received number",
          },
        ],
      },
    })
  })

  test("hides context usage entries from the rendered transcript", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "assistant_text",
        text: "Before usage update",
      }),
      entry({
        kind: "context_usage",
        contextUsage: {
          percentage: 59,
          totalTokens: 117354,
          maxTokens: 200000,
        },
      }),
      entry({
        kind: "assistant_text",
        text: "After usage update",
      }),
    ])

    expect(messages).toHaveLength(2)
    expect(messages.map((message) => message.kind)).toEqual(["assistant_text", "assistant_text"])
  })
})

describe("getLatestToolIds", () => {
  test("returns the latest unresolved special tool ids", () => {
    const hydratedMessages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "ask_user_question",
          toolName: "AskUserQuestion",
          toolId: "tool-1",
          input: {
            questions: [{ question: "Provider?" }],
          },
        },
      }),
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "todo_write",
          toolName: "TodoWrite",
          toolId: "tool-2",
          input: {
            todos: [{ content: "Implement adapter", status: "in_progress", activeForm: "Implementing adapter" }],
          },
        },
      }),
    ])

    const askMsg = hydratedMessages[0]
    const todoMsg = hydratedMessages[1]

    const renderUnits: TranscriptRenderUnit[] = hydratedMessages
      .filter((m) => m.kind === "tool")
      .map((m) => ({
        kind: "standalone_tool" as const,
        id: m.id,
        sourceEntryIds: [m.id],
        tool: m as Extract<typeof m, { kind: "tool" }>,
      }))

    expect(getLatestToolIds(renderUnits)).toEqual({
      AskUserQuestion: askMsg?.kind === "tool" ? askMsg.id : null,
      ExitPlanMode: null,
      TodoWrite: todoMsg?.kind === "tool" ? todoMsg.id : null,
    })
  })

  test("ignores discarded special tools when choosing the latest active id", () => {
    const messages = processTranscriptMessages([
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "ask_user_question",
          toolName: "AskUserQuestion",
          toolId: "tool-1",
          input: {
            questions: [{ question: "Provider?" }],
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-1",
        content: { discarded: true, answers: {} },
      }),
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "exit_plan_mode",
          toolName: "ExitPlanMode",
          toolId: "tool-2",
          input: {
            plan: "## Plan",
          },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-2",
        content: { discarded: true },
      }),
    ])

    expect(getLatestToolIds(messages)).toEqual({
      AskUserQuestion: null,
      ExitPlanMode: null,
      TodoWrite: null,
    })
  })
})

describe("createIncrementalHydrator", () => {
  test("hydrating entries one-by-one matches bulk processTranscriptMessages", () => {
    const entries: TranscriptEntry[] = [
      entry({ kind: "user_prompt", content: "Hello" }),
      entry({ kind: "assistant_text", text: "Hi there" }),
      entry({
        kind: "tool_call",
        tool: {
          kind: "tool",
          toolKind: "bash",
          toolName: "Bash",
          toolId: "tool-inc-1",
          input: { command: "ls" },
        },
      }),
      entry({
        kind: "tool_result",
        toolId: "tool-inc-1",
        content: "file1.ts\nfile2.ts\n",
      }),
      entry({ kind: "assistant_text", text: "Done" }),
      entry({
        kind: "result",
        subtype: "success",
        isError: false,
        durationMs: 1234,
        result: "Success",
        costUsd: 0.01,
      }),
    ]

    const bulk = processTranscriptMessages(entries)

    const hydrator = createIncrementalHydrator()
    for (const e of entries) {
      hydrator.hydrate(e)
    }

    const incremental = hydrator.getMessages()

    expect(incremental.length).toBe(bulk.length)
    for (let i = 0; i < bulk.length; i++) {
      expect(incremental[i]?.kind).toBe(bulk[i]?.kind)
      if (bulk[i]?.kind === "tool" && incremental[i]?.kind === "tool") {
        const bulkTool = bulk[i] as { result?: unknown; rawResult?: unknown; isError?: boolean }
        const incTool = incremental[i] as { result?: unknown; rawResult?: unknown; isError?: boolean }
        expect(incTool.result).toEqual(bulkTool.result)
        expect(incTool.rawResult).toEqual(bulkTool.rawResult)
        expect(incTool.isError).toEqual(bulkTool.isError)
      }
    }
  })

  test("tool_result correctly links back to pending tool_call", () => {
    const hydrator = createIncrementalHydrator()

    const toolCallEntry = entry({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: "tool-link-1",
        input: { command: "pwd" },
      },
    })

    const toolResultEntry = entry({
      kind: "tool_result",
      toolId: "tool-link-1",
      content: "/home/user\n",
    })

    const callMsg = hydrator.hydrate(toolCallEntry)
    expect(callMsg).not.toBeNull()
    expect(callMsg?.kind).toBe("tool")

    const resultMsg = hydrator.hydrate(toolResultEntry)
    // tool_result mutates the existing tool_call, returns null
    expect(resultMsg).toBeNull()

    const messages = hydrator.getMessages()
    expect(messages).toHaveLength(1)
    if (messages[0]?.kind !== "tool") throw new Error("expected tool message")
    expect(messages[0].result).toBe("/home/user\n")
  })

  test("hydrate returns null for tool_result entries", () => {
    const hydrator = createIncrementalHydrator()

    hydrator.hydrate(entry({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: "tool-null-1",
        input: { command: "echo hi" },
      },
    }))

    const result = hydrator.hydrate(entry({
      kind: "tool_result",
      toolId: "tool-null-1",
      content: "hi",
    }))

    expect(result).toBeNull()
  })

  test("hydrate returns the hydrated message for non-tool_result entries", () => {
    const hydrator = createIncrementalHydrator()

    const msg = hydrator.hydrate(entry({ kind: "user_prompt", content: "Hello" }))
    expect(msg).not.toBeNull()
    expect(msg?.kind).toBe("user_prompt")

    const msg2 = hydrator.hydrate(entry({ kind: "assistant_text", text: "Hi" }))
    expect(msg2).not.toBeNull()
    expect(msg2?.kind).toBe("assistant_text")
  })

  test("getMessages returns a stable reference when no new messages are added", () => {
    const hydrator = createIncrementalHydrator()
    hydrator.hydrate(entry({ kind: "user_prompt", content: "Hello" }))

    const ref1 = hydrator.getMessages()
    const ref2 = hydrator.getMessages()
    expect(ref1).toBe(ref2) // same reference
  })

  test("ask_user_question tool_result is correctly hydrated via incremental path", () => {
    const hydrator = createIncrementalHydrator()

    hydrator.hydrate(entry({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "ask_user_question",
        toolName: "AskUserQuestion",
        toolId: "tool-ask-1",
        input: {
          questions: [{ question: "Provider?" }],
        },
      },
    }))

    hydrator.hydrate(entry({
      kind: "tool_result",
      toolId: "tool-ask-1",
      content: { answers: { "Provider?": ["Codex"] } },
    }))

    const messages = hydrator.getMessages()
    expect(messages).toHaveLength(1)
    if (messages[0]?.kind !== "tool") throw new Error("expected tool")
    expect(messages[0].result).toEqual({ answers: { "Provider?": ["Codex"] } })
  })

  test("handles mixed entry types in sequence", () => {
    const entries: TranscriptEntry[] = [
      entry({ kind: "system_init", provider: "claude", model: "claude-3", tools: [], agents: [], slashCommands: [], mcpServers: [] }),
      entry({ kind: "user_prompt", content: "Hi" }),
      entry({ kind: "status", status: "thinking" }),
      entry({ kind: "assistant_text", text: "Hello!" }),
      entry({ kind: "compact_boundary" }),
      entry({ kind: "compact_summary", summary: "Greeted user" }),
      entry({ kind: "context_cleared" }),
      entry({ kind: "interrupted" }),
    ]

    const bulk = processTranscriptMessages(entries)
    const hydrator = createIncrementalHydrator()
    for (const e of entries) {
      hydrator.hydrate(e)
    }

    const incremental = hydrator.getMessages()
    expect(incremental.length).toBe(bulk.length)
    for (let i = 0; i < bulk.length; i++) {
      expect(incremental[i]?.kind).toBe(bulk[i]?.kind)
    }
  })

  test("getMessages returns a new reference after tool_result mutates existing tool call", () => {
    const hydrator = createIncrementalHydrator()

    hydrator.hydrate(entry({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: "tool-dirty-1",
        input: { command: "pwd" },
      },
    }))

    // Snapshot before tool_result
    const refBefore = hydrator.getMessages()
    expect(refBefore).toHaveLength(1)
    if (refBefore[0]?.kind !== "tool") throw new Error("expected tool")
    expect(refBefore[0].result).toBeUndefined()

    // tool_result mutates the tool call in-place, returns null
    const resultMsg = hydrator.hydrate(entry({
      kind: "tool_result",
      toolId: "tool-dirty-1",
      content: "/home/user\n",
    }))
    expect(resultMsg).toBeNull()

    // getMessages must return a NEW reference so React detects the change
    const refAfter = hydrator.getMessages()
    expect(refAfter).not.toBe(refBefore) // different identity
    expect(refAfter).toHaveLength(1)
    if (refAfter[0]?.kind !== "tool") throw new Error("expected tool")
    expect(refAfter[0].result).toBe("/home/user\n")

    // Subsequent call without changes should be stable again
    const refStable = hydrator.getMessages()
    expect(refStable).toBe(refAfter)
  })

  test("skips duplicate entries when fetch and buffer overlap after reset", () => {
    const hydrator = createIncrementalHydrator()

    const entryA = entry({ kind: "user_prompt", content: "Hello" })
    const entryB = entry({ kind: "assistant_text", text: "Hi there" })
    const entryC = entry({ kind: "assistant_text", text: "How can I help?" })
    const entryD = entry({ kind: "user_prompt", content: "Fix a bug" })

    // Simulate flushTail: reset then hydrate fetched + overlapping buffer
    hydrator.reset()
    // Fetched entries
    hydrator.hydrate(entryA)
    hydrator.hydrate(entryB)
    hydrator.hydrate(entryC)
    // Buffer entries (B and C overlap with fetched, D is new)
    hydrator.hydrate(entryB)
    hydrator.hydrate(entryC)
    hydrator.hydrate(entryD)

    const messages = hydrator.getMessages()
    expect(messages).toHaveLength(4)
    expect(messages.map((m) => m.id)).toEqual([entryA._id, entryB._id, entryC._id, entryD._id])
  })

  test("skips duplicate real-time event after initial hydration", () => {
    const hydrator = createIncrementalHydrator()

    const entryA = entry({ kind: "user_prompt", content: "Hello" })
    const entryB = entry({ kind: "assistant_text", text: "Hi" })

    hydrator.hydrate(entryA)
    hydrator.hydrate(entryB)
    // Delayed re-delivery of entryA
    const duplicate = hydrator.hydrate(entryA)

    expect(duplicate).toBeNull()
    expect(hydrator.getMessages()).toHaveLength(2)
  })

  test("reset clears dedup state so previously seen entries can be re-hydrated", () => {
    const hydrator = createIncrementalHydrator()

    const entryA = entry({ kind: "user_prompt", content: "Hello" })
    hydrator.hydrate(entryA)
    expect(hydrator.getMessages()).toHaveLength(1)

    hydrator.reset()
    hydrator.hydrate(entryA)
    expect(hydrator.getMessages()).toHaveLength(1)
    expect(hydrator.getMessages()[0]?.id).toBe(entryA._id)
  })

  test("reset clears all state", () => {
    const hydrator = createIncrementalHydrator()
    hydrator.hydrate(entry({ kind: "user_prompt", content: "Hello" }))
    expect(hydrator.getMessages()).toHaveLength(1)

    hydrator.reset()
    expect(hydrator.getMessages()).toHaveLength(0)

    // Can still hydrate after reset
    hydrator.hydrate(entry({ kind: "assistant_text", text: "Fresh start" }))
    expect(hydrator.getMessages()).toHaveLength(1)
    expect(hydrator.getMessages()[0]?.kind).toBe("assistant_text")
  })

  test("deduplicates without reset — cache restore scenario", () => {
    const hydrator = createIncrementalHydrator()

    const entryA = entry({ kind: "user_prompt", content: "Hello" })
    const entryB = entry({ kind: "assistant_text", text: "Hi there" })
    const entryC = entry({ kind: "assistant_text", text: "How can I help?" })
    const entryD = entry({ kind: "user_prompt", content: "Fix a bug" })

    // Initial hydration (simulates first visit)
    hydrator.hydrate(entryA)
    hydrator.hydrate(entryB)
    hydrator.hydrate(entryC)
    expect(hydrator.getMessages()).toHaveLength(3)

    // Simulate cache restore: do NOT reset.
    // Feed overlapping entries (A,B,C) + new entry (D).
    // Hydrator should skip A,B,C and only add D.
    hydrator.hydrate(entryA)
    hydrator.hydrate(entryB)
    hydrator.hydrate(entryC)
    hydrator.hydrate(entryD)

    const messages = hydrator.getMessages()
    expect(messages).toHaveLength(4)
    expect(messages.map((m) => m.id)).toEqual([entryA._id, entryB._id, entryC._id, entryD._id])
  })

  test("deduplicates without reset — tool_call + tool_result across cache boundary", () => {
    const hydrator = createIncrementalHydrator()

    const toolCallEntry = entry({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: "tool-cache-1",
        input: { command: "ls" },
      },
    })
    const toolResultEntry = entry({
      kind: "tool_result",
      toolId: "tool-cache-1",
      content: "file.ts\n",
    })
    const newEntry = entry({ kind: "assistant_text", text: "Done" })

    // First visit: hydrate tool_call + tool_result
    hydrator.hydrate(toolCallEntry)
    hydrator.hydrate(toolResultEntry)
    const cached = hydrator.getMessages()
    expect(cached).toHaveLength(1)
    if (cached[0]?.kind !== "tool") throw new Error("expected tool")
    expect(cached[0].result).toBe("file.ts\n")

    // Cache restore: re-feed same entries + new one — no reset
    hydrator.hydrate(toolCallEntry)
    hydrator.hydrate(toolResultEntry)
    hydrator.hydrate(newEntry)

    const restored = hydrator.getMessages()
    expect(restored).toHaveLength(2)
    expect(restored[0]?.kind).toBe("tool")
    expect(restored[1]?.kind).toBe("assistant_text")
  })
})

import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { AppTransport } from "../../app/socket-interface"
import type { OrchestrationChildNode } from "../../../shared/types"
import {
  SubagentIndicator,
  SUBAGENT_INSPECTOR_LAYOUT_CLASSES,
  SUBAGENT_TRANSCRIPT_RICH_CONTENT_CHROME,
  SubagentInspectorTranscript,
  allTerminal,
  countNodes,
  flattenNodes,
  formatElapsed,
  isActiveStatus,
} from "./SubagentIndicator"

function makeNode(overrides: Partial<OrchestrationChildNode> & { chatId: string }): OrchestrationChildNode {
  return {
    status: "running",
    spawnedAt: Date.now() - 60_000,
    lastStatusAt: Date.now(),
    instruction: "test task",
    children: [],
    ...overrides,
  }
}

function createSocket(): AppTransport {
  return {
    start: () => {},
    dispose: () => {},
    onStatus: () => () => {},
    subscribe: () => () => {},
    subscribeTerminal: () => () => {},
    command: async <TResult = unknown>(_command: unknown): Promise<TResult> => [] as TResult,
    ensureHealthyConnection: async () => {},
  }
}

describe("SubagentIndicator helpers", () => {
  test("tracks active statuses", () => {
    expect(isActiveStatus("spawning")).toBe(true)
    expect(isActiveStatus("running")).toBe(true)
    expect(isActiveStatus("waiting")).toBe(true)
    expect(isActiveStatus("completed")).toBe(false)
  })

  test("formats elapsed durations", () => {
    expect(formatElapsed(45_000)).toBe("45s")
    expect(formatElapsed(92_000)).toBe("1m32s")
    expect(formatElapsed(3_720_000)).toBe("1h2m")
  })

  test("counts nested nodes", () => {
    expect(countNodes([
      makeNode({
        chatId: "a",
        children: [
          makeNode({ chatId: "b", status: "waiting" }),
          makeNode({ chatId: "c", status: "failed" }),
        ],
      }),
    ])).toEqual({ total: 3, active: 2, failed: 1 })
  })

  test("detects terminal trees", () => {
    expect(allTerminal([
      makeNode({ chatId: "a", status: "completed" }),
      makeNode({ chatId: "b", status: "closed" }),
    ])).toBe(true)
    expect(allTerminal([
      makeNode({ chatId: "a", status: "completed", children: [makeNode({ chatId: "b", status: "running" })] }),
    ])).toBe(false)
  })

  test("flattens nested nodes while preserving depth", () => {
    expect(flattenNodes([
      makeNode({
        chatId: "root",
        children: [
          makeNode({ chatId: "child-1" }),
          makeNode({ chatId: "child-2", children: [makeNode({ chatId: "leaf" })] }),
        ],
      }),
    ])).toEqual([
      expect.objectContaining({ chatId: "root", depth: 0 }),
      expect.objectContaining({ chatId: "child-1", depth: 1 }),
      expect.objectContaining({ chatId: "child-2", depth: 1 }),
      expect.objectContaining({ chatId: "leaf", depth: 2 }),
    ])
  })
})

describe("SubagentInspectorTranscript", () => {
  test("keeps the inspector shell height-bounded so the transcript can scroll", () => {
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.content).toContain("h-[min(85vh,48rem)]")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.body).toContain("overflow-hidden")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.body).toContain("min-h-0")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.shell).toContain("min-h-0")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.shell).toContain("h-full")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.transcriptSlot).toContain("min-h-0")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.transcriptSlot).toContain("flex-1")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.transcriptSlot).not.toContain("p-3")
    expect(SUBAGENT_INSPECTOR_LAYOUT_CLASSES.transcriptSlot).not.toContain("md:p-4")
  })

  test("renders loading state", () => {
    const html = renderToStaticMarkup(createElement(SubagentInspectorTranscript, {
      session: { snapshot: null, messages: [], isLoading: true, error: null },
      scrollRef: { current: null },
      onOpenLocalLink: () => {},
      onOpenExternalLink: () => false,
    }))

    expect(html).toContain("Loading full transcript")
    expect(html).toContain("flex-1")
    expect(html).toContain("bg-muted/20")
  })

  test("renders empty state", () => {
    const html = renderToStaticMarkup(createElement(SubagentInspectorTranscript, {
      session: { snapshot: null, messages: [], isLoading: false, error: null },
      scrollRef: { current: null },
      onOpenLocalLink: () => {},
      onOpenExternalLink: () => false,
    }))

    expect(html).toContain("This session has no transcript yet.")
  })

  test("keeps transcript content inside a bounded scroll shell", () => {
    const html = renderToStaticMarkup(createElement(SubagentInspectorTranscript, {
      session: {
        snapshot: null,
        messages: [{
          kind: "assistant_response",
          id: "unit-1",
          sourceEntryIds: ["msg-1"],
          message: { kind: "assistant_text", text: "hello", id: "msg-1", timestamp: "2026-04-13T00:00:00Z" },
        }],
        isLoading: false,
        error: null,
      },
      scrollRef: { current: null },
      onOpenLocalLink: () => {},
      onOpenExternalLink: () => false,
    }))

    expect(html).toContain("flex h-full min-h-0 flex-1 flex-col")
    expect(html).toContain("min-h-0 flex-1 overflow-y-auto")
  })

  test("uses inline rich-content chrome for subagent transcript previews", () => {
    expect(SUBAGENT_TRANSCRIPT_RICH_CONTENT_CHROME).toBe("inline")
  })
})

describe("SubagentIndicator", () => {
  test("renders nothing when no hierarchy is available", () => {
    const html = renderToStaticMarkup(createElement(SubagentIndicator, {
      parentChatId: "parent-chat",
      hierarchy: null,
      socket: createSocket(),
      onOpenLocalLink: () => {},
      onOpenExternalLink: () => false,
    }))

    expect(html).toBe("")
  })

  test("renders the trigger summary when agents are present", () => {
    const html = renderToStaticMarkup(
      createElement(SubagentIndicator, {
        parentChatId: "parent-chat",
        hierarchy: {
          children: [
            makeNode({ chatId: "agent-1", status: "running", instruction: "Inspect regression" }),
            makeNode({ chatId: "agent-2", status: "failed", instruction: "Review failing path" }),
          ],
        },
        socket: createSocket(),
        knownChatIds: new Set(["agent-1"]),
        onOpenLocalLink: () => {},
        onOpenExternalLink: () => false,
      }),
    )

    expect(html).toContain("1 running")
    expect(html).toContain("1 failed")
    expect(html).toContain('data-ui-id="chat.composer.subagents.toggle"')
  })
})

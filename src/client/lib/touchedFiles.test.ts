import { describe, expect, test } from "bun:test"
import { deriveTouchedFiles } from "./touchedFiles"
import type { HydratedToolCall, TranscriptRenderUnit } from "../../shared/types"

function toolCall(toolKind: string, filePath: string | undefined, id: string): HydratedToolCall {
  return {
    kind: "tool",
    toolKind,
    toolName: toolKind,
    toolId: id,
    id,
    input: filePath === undefined ? {} : { filePath },
    timestamp: "",
  } as unknown as HydratedToolCall
}

function standalone(tool: HydratedToolCall, id: string): TranscriptRenderUnit {
  return { kind: "standalone_tool", id, sourceEntryIds: [], tool } as unknown as TranscriptRenderUnit
}

function group(tools: HydratedToolCall[], id: string): TranscriptRenderUnit {
  return { kind: "tool_group", id, sourceEntryIds: [], tools } as unknown as TranscriptRenderUnit
}

function wip(steps: HydratedToolCall[], id: string): TranscriptRenderUnit {
  return { kind: "wip_block", id, sourceEntryIds: [], steps } as unknown as TranscriptRenderUnit
}

describe("deriveTouchedFiles", () => {
  test("returns empty for no units", () => {
    expect(deriveTouchedFiles([])).toEqual([])
  })

  test("labels write_file as created and edit_file as edited (standalone)", () => {
    const units = [
      standalone(toolCall("write_file", "docs/plan.md", "a"), "u1"),
      standalone(toolCall("edit_file", "src/app.ts", "b"), "u2"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([
      { path: "src/app.ts", change: "edited" },
      { path: "docs/plan.md", change: "created" },
    ])
  })

  test("extracts tool calls from tool_group.tools", () => {
    const units = [
      group([toolCall("write_file", "a.md", "a"), toolCall("edit_file", "b.ts", "b")], "u1"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([
      { path: "b.ts", change: "edited" },
      { path: "a.md", change: "created" },
    ])
  })

  test("extracts tool calls from wip_block.steps", () => {
    const units = [wip([toolCall("write_file", "a.md", "a")], "u1")]
    expect(deriveTouchedFiles(units)).toEqual([{ path: "a.md", change: "created" }])
  })

  test("dedups by path, latest occurrence wins (write then edit -> edited)", () => {
    const units = [
      standalone(toolCall("write_file", "docs/plan.md", "a"), "u1"),
      standalone(toolCall("edit_file", "docs/plan.md", "b"), "u2"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([{ path: "docs/plan.md", change: "edited" }])
  })

  test("dedups by path, latest occurrence wins (edit then write -> created)", () => {
    const units = [
      standalone(toolCall("edit_file", "docs/plan.md", "a"), "u1"),
      standalone(toolCall("write_file", "docs/plan.md", "b"), "u2"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([{ path: "docs/plan.md", change: "created" }])
  })

  test("orders most-recently-touched first", () => {
    const units = [
      standalone(toolCall("write_file", "a.md", "a"), "u1"),
      standalone(toolCall("write_file", "b.ts", "b"), "u2"),
      standalone(toolCall("edit_file", "a.md", "c"), "u3"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([
      { path: "a.md", change: "edited" },
      { path: "b.ts", change: "created" },
    ])
  })

  test("ignores read_file and other tool kinds", () => {
    const units = [
      standalone(toolCall("read_file", "a.md", "a"), "u1"),
      standalone(toolCall("bash", undefined, "b"), "u2"),
      standalone(toolCall("grep", undefined, "c"), "u3"),
      standalone(toolCall("write_file", "b.ts", "d"), "u4"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([{ path: "b.ts", change: "created" }])
  })

  test("skips file tool calls with missing or empty path", () => {
    const units = [
      standalone(toolCall("write_file", undefined, "a"), "u1"),
      standalone(toolCall("edit_file", "   ", "b"), "u2"),
      standalone(toolCall("write_file", "ok.md", "c"), "u3"),
    ]
    expect(deriveTouchedFiles(units)).toEqual([{ path: "ok.md", change: "created" }])
  })

  test("ignores non-tool wip steps", () => {
    const steps = [
      { kind: "status", id: "s1" } as unknown as HydratedToolCall,
      toolCall("write_file", "a.md", "a"),
    ]
    const units = [wip(steps, "u1")]
    expect(deriveTouchedFiles(units)).toEqual([{ path: "a.md", change: "created" }])
  })
})

import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { getToolErrorHint, ToolCallMessage } from "./ToolCallMessage"

describe("getToolErrorHint", () => {
  test("returns permission hint for permission denied errors", () => {
    expect(getToolErrorHint("Error: EACCES: permission denied, open '/etc/shadow'"))
      .toBe("The tool couldn't access a file. Check file permissions.")
  })

  test("returns command hint for command not found errors", () => {
    expect(getToolErrorHint("bash: foobar: command not found"))
      .toBe("The command isn't installed or isn't in PATH.")
  })

  test("returns timeout hint for timeout errors", () => {
    expect(getToolErrorHint("Operation timed out after 30000ms"))
      .toBe("The operation took too long.")
  })

  test("returns timeout hint for 'timeout' variant", () => {
    expect(getToolErrorHint("Request timeout exceeded"))
      .toBe("The operation took too long.")
  })

  test("returns file hint for ENOENT errors", () => {
    expect(getToolErrorHint("Error: ENOENT: no such file or directory, open '/missing'"))
      .toBe("A referenced file or directory doesn't exist.")
  })

  test("returns null for unrecognized hard errors", () => {
    expect(getToolErrorHint("TypeError: Cannot read properties of undefined"))
      .toBeNull()
  })

  test("returns null for empty strings", () => {
    expect(getToolErrorHint("")).toBeNull()
  })
})

describe("ToolCallMessage", () => {
  test("renders the tool call root with C3 ownership metadata", () => {
    const html = renderToStaticMarkup(
      createElement(ToolCallMessage, {
        message: {
          kind: "tool",
          toolKind: "bash",
          toolName: "Bash",
          toolId: "tool-1",
          id: "tool-1",
          timestamp: "2026-04-02T00:00:00.000Z",
          input: { command: "pwd" },
        } as Parameters<typeof ToolCallMessage>[0]["message"],
      })
    )

    expect(html).toContain('data-ui-id="message.tool-call.item"')
    expect(html).toContain('data-ui-c3="c3-111"')
    expect(html).toContain('data-ui-c3-label="messages"')
  })

  test("write_file card shows an always-visible Open preview affordance (no expansion needed)", () => {
    const html = renderToStaticMarkup(
      createElement(ToolCallMessage, {
        message: {
          kind: "tool",
          toolKind: "write_file",
          toolName: "Write",
          toolId: "tool-w",
          id: "tool-w",
          timestamp: "2026-04-02T00:00:00.000Z",
          input: { filePath: "/tmp/x/plan.md", content: "# hi" },
        } as Parameters<typeof ToolCallMessage>[0]["message"],
      })
    )
    expect(html).toContain("Open preview")
  })

  test("edit_file card shows an always-visible Open preview affordance", () => {
    const html = renderToStaticMarkup(
      createElement(ToolCallMessage, {
        message: {
          kind: "tool",
          toolKind: "edit_file",
          toolName: "Edit",
          toolId: "tool-e",
          id: "tool-e",
          timestamp: "2026-04-02T00:00:00.000Z",
          input: { filePath: "/tmp/x/app.ts", oldString: "a", newString: "b" },
        } as Parameters<typeof ToolCallMessage>[0]["message"],
      })
    )
    expect(html).toContain("Open preview")
  })

  test("non-file tool (bash) shows no Open preview affordance", () => {
    const html = renderToStaticMarkup(
      createElement(ToolCallMessage, {
        message: {
          kind: "tool",
          toolKind: "bash",
          toolName: "Bash",
          toolId: "tool-b",
          id: "tool-b",
          timestamp: "2026-04-02T00:00:00.000Z",
          input: { command: "ls" },
        } as Parameters<typeof ToolCallMessage>[0]["message"],
      })
    )
    expect(html).not.toContain("Open preview")
  })
})

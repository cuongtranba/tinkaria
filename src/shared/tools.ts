export const KANNA_MCP_SERVER_NAME = "tinkaria-mcp"

import type {
  AskUserQuestionItem,
  AskUserQuestionAnswerMap,
  AskUserQuestionToolResult,
  ExitPlanModeToolResult,
  HydratedToolCall,
  ImageContentBlock,
  NormalizedToolCall,
  PresentContentInput,
  PresentContentErrorToolResult,
  PresentContentSchemaValidationError,
  PresentContentValidationIssue,
  PresentContentToolResult,
  ReadFileImageResult,
  ReadFileToolResult,
  TodoItem,
} from "./types"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isPresentContentKind(value: unknown): value is PresentContentInput["kind"] {
  return value === "markdown" || value === "code" || value === "diagram"
}

function isPresentContentValidationIssue(value: unknown): value is PresentContentValidationIssue {
  return Boolean(value)
    && typeof value === "object"
    && Array.isArray((value as { path?: unknown }).path)
    && ((value as { path?: unknown[] }).path?.every((segment) => typeof segment === "string") ?? false)
    && typeof (value as { code?: unknown }).code === "string"
    && typeof (value as { message?: unknown }).message === "string"
}

function isPresentContentSchemaValidationError(value: unknown): value is PresentContentSchemaValidationError {
  return Boolean(value)
    && typeof value === "object"
    && (value as { source?: unknown }).source === "schema_validation"
    && (value as { schema?: unknown }).schema === "present_content"
    && Array.isArray((value as { issues?: unknown }).issues)
    && ((value as { issues?: unknown[] }).issues?.every(isPresentContentValidationIssue) ?? false)
}

export function normalizeToolCall(args: {
  toolName: string
  toolId: string
  input: Record<string, unknown>
}): NormalizedToolCall {
  const { toolName, toolId, input } = args

  switch (toolName) {
    case "AskUserQuestion":
      return {
        kind: "tool",
        toolKind: "ask_user_question",
        toolName,
        toolId,
        input: {
          questions: Array.isArray(input.questions) ? (input.questions as AskUserQuestionItem[]) : [],
        },
        rawInput: input,
      }
    case "present_content":
      return {
        kind: "tool",
        toolKind: "present_content",
        toolName,
        toolId,
        input: {
          title: typeof input.title === "string" ? input.title : "",
          kind: isPresentContentKind(input.kind) ? input.kind : "markdown",
          format: typeof input.format === "string" ? input.format : "text",
          source: typeof input.source === "string" ? input.source : "",
          summary: typeof input.summary === "string" ? input.summary : undefined,
          collapsed: typeof input.collapsed === "boolean" ? input.collapsed : undefined,
        },
        rawInput: input,
      }
    case "ExitPlanMode":
      return {
        kind: "tool",
        toolKind: "exit_plan_mode",
        toolName,
        toolId,
        input: {
          plan: typeof input.plan === "string" ? input.plan : undefined,
          summary: typeof input.summary === "string" ? input.summary : undefined,
        },
        rawInput: input,
      }
    case "TodoWrite":
      return {
        kind: "tool",
        toolKind: "todo_write",
        toolName,
        toolId,
        input: {
          todos: Array.isArray(input.todos) ? (input.todos as TodoItem[]) : [],
        },
        rawInput: input,
      }
    case "Skill":
      return {
        kind: "tool",
        toolKind: "skill",
        toolName,
        toolId,
        input: {
          skill: typeof input.skill === "string" ? input.skill : "",
        },
        rawInput: input,
      }
    case "Glob":
      return {
        kind: "tool",
        toolKind: "glob",
        toolName,
        toolId,
        input: {
          pattern: typeof input.pattern === "string" ? input.pattern : "",
        },
        rawInput: input,
      }
    case "Grep":
      return {
        kind: "tool",
        toolKind: "grep",
        toolName,
        toolId,
        input: {
          pattern: typeof input.pattern === "string" ? input.pattern : "",
          outputMode: typeof input.output_mode === "string" ? input.output_mode : undefined,
        },
        rawInput: input,
      }
    case "Bash":
      return {
        kind: "tool",
        toolKind: "bash",
        toolName,
        toolId,
        input: {
          command: typeof input.command === "string" ? input.command : "",
          description: typeof input.description === "string" ? input.description : undefined,
          timeoutMs: typeof input.timeout === "number" ? input.timeout : undefined,
          runInBackground: Boolean(input.run_in_background),
        },
        rawInput: input,
      }
    case "WebSearch":
      return {
        kind: "tool",
        toolKind: "web_search",
        toolName,
        toolId,
        input: {
          query: typeof input.query === "string" ? input.query : "",
        },
        rawInput: input,
      }
    case "Read":
      return {
        kind: "tool",
        toolKind: "read_file",
        toolName,
        toolId,
        input: {
          filePath: typeof input.file_path === "string" ? input.file_path : "",
        },
        rawInput: input,
      }
    case "Write":
      return {
        kind: "tool",
        toolKind: "write_file",
        toolName,
        toolId,
        input: {
          filePath: typeof input.file_path === "string" ? input.file_path : "",
          content: typeof input.content === "string" ? input.content : "",
        },
        rawInput: input,
      }
    case "Edit":
      return {
        kind: "tool",
        toolKind: "edit_file",
        toolName,
        toolId,
        input: {
          filePath: typeof input.file_path === "string" ? input.file_path : "",
          oldString: typeof input.old_string === "string" ? input.old_string : "",
          newString: typeof input.new_string === "string" ? input.new_string : "",
        },
        rawInput: input,
      }
  }

  const mcpMatch = toolName.match(/^mcp__(.+?)__(.+)$/)
  if (mcpMatch) {
    return {
      kind: "tool",
      toolKind: "mcp_generic",
      toolName,
      toolId,
      input: {
        server: mcpMatch[1],
        tool: mcpMatch[2],
        payload: input,
      },
      rawInput: input,
    }
  }

  if (
    toolName === "spawn_agent"
    || toolName === "list_agents"
    || toolName === "send_input"
    || toolName === "wait_agent"
    || toolName === "close_agent"
  ) {
    return {
      kind: "tool",
      toolKind: "mcp_generic",
      toolName,
      toolId,
      input: {
        server: "session-orchestration",
        tool: toolName,
        payload: input,
      },
      rawInput: input,
    }
  }

  if (typeof input.subagent_type === "string") {
    return {
      kind: "tool",
      toolKind: "subagent_task",
      toolName,
      toolId,
      input: {
        subagentType: input.subagent_type,
      },
      rawInput: input,
    }
  }

  return {
    kind: "tool",
    toolKind: "unknown_tool",
    toolName,
    toolId,
    input: {
      payload: input,
    },
    rawInput: input,
  }
}

const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024 // ~7.5MB decoded

const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp",
])

function extractImageBlocks(parsed: unknown): ReadFileImageResult | null {
  if (!Array.isArray(parsed)) return null

  const images: ImageContentBlock[] = []
  let text: string | undefined

  for (const block of parsed) {
    const record = asRecord(block)
    if (!record) continue

    if (record.type === "image") {
      const source = asRecord(record.source)
      if (
        source &&
        source.type === "base64" &&
        typeof source.media_type === "string" &&
        ALLOWED_IMAGE_MEDIA_TYPES.has(source.media_type) &&
        typeof source.data === "string" &&
        source.data.length <= MAX_IMAGE_BASE64_LENGTH
      ) {
        images.push({ mediaType: source.media_type, data: source.data })
      }
    }

    if (record.type === "text" && typeof record.text === "string") {
      text = text ? `${text}\n${record.text}` : record.text
    }
  }

  if (images.length === 0) return null
  return { images, text }
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch (error: unknown) {
    void error
    return value
  }
}

export function hydrateToolResult(tool: NormalizedToolCall, raw: unknown): HydratedToolCall["result"] {
  const parsed = parseJsonValue(raw)

  switch (tool.toolKind) {
    case "ask_user_question": {
      const record = asRecord(parsed)
      const answers = asRecord(record?.answers) ?? (record ? record : {})
      return {
        answers: Object.fromEntries(
          Object.entries(answers).map(([key, value]) => {
            if (Array.isArray(value)) {
              return [key, value.map((entry) => String(entry))]
            }
            if (value && typeof value === "object" && Array.isArray((value as { answers?: unknown }).answers)) {
              return [key, (value as { answers: unknown[] }).answers.map((entry) => String(entry))]
            }
            if (value == null || value === "") {
              return [key, []]
            }
            return [key, [String(value)]]
          })
        ) as AskUserQuestionAnswerMap,
        ...(record?.discarded === true ? { discarded: true } : {}),
      } satisfies AskUserQuestionToolResult
    }
    case "exit_plan_mode": {
      const record = asRecord(parsed)
      return {
        confirmed: typeof record?.confirmed === "boolean" ? record.confirmed : undefined,
        clearContext: typeof record?.clearContext === "boolean" ? record.clearContext : undefined,
        message: typeof record?.message === "string" ? record.message : undefined,
        ...(record?.discarded === true ? { discarded: true } : {}),
      } satisfies ExitPlanModeToolResult
    }
    case "read_file": {
      if (typeof parsed === "string") {
        return parsed
      }
      const imageResult = extractImageBlocks(parsed)
      if (imageResult) return imageResult
      const record = asRecord(parsed)
      return {
        content: typeof record?.content === "string" ? record.content : JSON.stringify(parsed, null, 2),
      } satisfies ReadFileToolResult
    }
    case "present_content": {
      const record = asRecord(parsed)
      if (isPresentContentSchemaValidationError(record?.error)) {
        return {
          error: record.error,
        } satisfies PresentContentErrorToolResult
      }
      if (typeof record?.error === "string") {
        return {
          error: {
            source: "schema_validation",
            schema: "present_content",
            issues: [
              {
                path: [],
                code: "custom",
                message: record.error,
              },
            ],
          },
        } satisfies PresentContentErrorToolResult
      }
      return {
        accepted: true,
        title: typeof record?.title === "string" ? record.title : tool.input.title,
        kind: isPresentContentKind(record?.kind) ? record.kind : tool.input.kind,
        format: typeof record?.format === "string" ? record.format : tool.input.format,
        source: typeof record?.source === "string" ? record.source : tool.input.source,
        summary: typeof record?.summary === "string" ? record.summary : tool.input.summary,
        collapsed: typeof record?.collapsed === "boolean" ? record.collapsed : tool.input.collapsed,
      } satisfies PresentContentToolResult
    }
    default: {
      const imageResult = extractImageBlocks(parsed)
      if (imageResult) return imageResult
      return parsed
    }
  }
}

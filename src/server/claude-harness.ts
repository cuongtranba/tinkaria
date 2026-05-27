import * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk"
import type { CanUseTool, McpServerConfig, Options as ClaudeOptions, PermissionResult, Query } from "@anthropic-ai/claude-agent-sdk"
import { homedir } from "node:os"
import { resolveClaudeApiModelId, type TranscriptEntry } from "../shared/types"
import { getWebContextPrompt } from "../shared/web-context"
import { normalizeToolCall } from "../shared/tools"
import type { HarnessEvent, HarnessToolRequest, HarnessTurn } from "./harness-types"
import type { SessionOrchestrator } from "./orchestration"
import { createOrchestrationMcpServer } from "./orchestration"
import { createCoordinationMcpServer } from "./coordination-mcp"
import type { CoordinationStore } from "../shared/coordination-store"
import { resolveClaudeBinary } from "./claude-pty/resolve-binary.adapter"

const CLAUDE_TOOLSET = [
  "Skill",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput",
  "Bash",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "TodoWrite",
  "KillShell",
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
] as const

export interface ClaudeSdkBinding {
  query(args: { prompt: string; options?: ClaudeOptions }): Query
  startup?: (args?: { options?: ClaudeOptions }) => Promise<{ query: (prompt: string) => Query }>
}

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
  createdAt = Date.now(),
): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt,
    ...entry,
  } as TranscriptEntry
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function createClaudeCanUseTool(
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>,
): CanUseTool {
  return async (toolName, input, options) => {
    if (toolName !== "AskUserQuestion" && toolName !== "ExitPlanMode") {
      return {
        behavior: "allow",
        updatedInput: input,
      }
    }

    const tool = normalizeToolCall({
      toolName,
      toolId: options.toolUseID,
      input: (input ?? {}) as Record<string, unknown>,
    })

    if (tool.toolKind !== "ask_user_question" && tool.toolKind !== "exit_plan_mode") {
      return {
        behavior: "deny",
        message: "Unsupported tool request",
      }
    }

    const result = await onToolRequest({ tool })

    if (tool.toolKind === "ask_user_question") {
      const record = result && typeof result === "object" ? result as Record<string, unknown> : {}
      return {
        behavior: "allow",
        updatedInput: {
          ...(tool.rawInput ?? {}),
          questions: record.questions ?? tool.input.questions,
          answers: record.answers ?? result,
        },
      } satisfies PermissionResult
    }

    const record = result && typeof result === "object" ? result as Record<string, unknown> : {}
    const confirmed = Boolean(record.confirmed)
    if (confirmed) {
      return {
        behavior: "allow",
        updatedInput: {
          ...(tool.rawInput ?? {}),
          ...record,
        },
      } satisfies PermissionResult
    }

    return {
      behavior: "deny",
      message: typeof record.message === "string"
        ? `User wants to suggest edits to the plan: ${record.message}`
        : "User wants to suggest edits to the plan before approving.",
    } satisfies PermissionResult
  }
}

async function createClaudeOptions(args: {
  localPath: string
  model: string
  effort?: string
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  orchestrator?: SessionOrchestrator
  chatId?: string
  store?: CoordinationStore
  extraEnv?: Record<string, string>
  /** Injected binary resolver; defaults to the real resolve-binary.adapter. Tests override this. */
  _resolveBinary?: typeof resolveClaudeBinary
}): Promise<ClaudeOptions> {
  const mcpServers: Record<string, McpServerConfig> = {}

  if (args.orchestrator && args.chatId) {
    mcpServers["session-orchestration"] = createOrchestrationMcpServer(args.orchestrator, args.chatId)
  }

  if (args.store) {
    mcpServers["project-coordination"] = createCoordinationMcpServer(args.store)
  }

  // Resolve the claude binary runner-side — same adapter used by startClaudePtyTurn.
  // Merge extraEnv (non-secret profile env) into the env passed to the resolver so
  // that CLAUDE_EXECUTABLE / CLAUDE_CODE_EXECPATH set via profile are honoured.
  const resolver = args._resolveBinary ?? resolveClaudeBinary
  const mergedEnv = { ...process.env, ...args.extraEnv }
  const resolved = await resolver({
    env: mergedEnv,
    homeDir: homedir(),
    cwd: args.localPath,
  })

  return {
    cwd: args.localPath,
    model: resolveClaudeApiModelId(args.model),
    effort: args.effort as "low" | "medium" | "high" | "max" | undefined,
    resume: args.sessionToken ?? undefined,
    permissionMode: (args.planMode ? "plan" : "acceptEdits") as ClaudeOptions["permissionMode"],
    canUseTool: createClaudeCanUseTool(args.onToolRequest),
    tools: [...CLAUDE_TOOLSET],
    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: getWebContextPrompt("claude"),
    },
    settingSources: ["user", "project", "local"],
    env: (() => {
      const { CLAUDECODE: _, ...env } = process.env
      return { ...env, ...args.extraEnv }
    })(),
    pathToClaudeCodeExecutable: resolved.path,
  } satisfies ClaudeOptions
}

export function normalizeClaudeStreamMessage(message: any): TranscriptEntry[] {
  const debugRaw = process.env.KANNA_DEBUG_RAW ? JSON.stringify(message) : undefined
  const messageId = typeof message.uuid === "string" ? message.uuid : undefined

  if (message.type === "system" && message.subtype === "init") {
    return [
      timestamped({
        kind: "system_init",
        messageId,
        provider: "claude",
        model: typeof message.model === "string" ? message.model : "unknown",
        tools: Array.isArray(message.tools) ? message.tools : [],
        agents: Array.isArray(message.agents) ? message.agents : [],
        slashCommands: Array.isArray(message.slash_commands)
          ? message.slash_commands.filter((entry: string) => !entry.startsWith("._"))
          : [],
        mcpServers: Array.isArray(message.mcp_servers) ? message.mcp_servers : [],
        debugRaw,
      }),
    ]
  }

  if (message.type === "assistant" && Array.isArray(message.message?.content)) {
    const entries: TranscriptEntry[] = []
    for (const content of message.message.content) {
      if (content.type === "text" && typeof content.text === "string") {
        entries.push(timestamped({
          kind: "assistant_text",
          messageId,
          text: content.text,
          debugRaw,
        }))
      }
      if (content.type === "tool_use" && typeof content.name === "string" && typeof content.id === "string") {
        entries.push(timestamped({
          kind: "tool_call",
          messageId,
          tool: normalizeToolCall({
            toolName: content.name,
            toolId: content.id,
            input: (content.input ?? {}) as Record<string, unknown>,
          }),
          debugRaw,
        }))
      }
    }
    return entries
  }

  if (message.type === "user" && Array.isArray(message.message?.content)) {
    const entries: TranscriptEntry[] = []
    for (const content of message.message.content) {
      if (content.type === "tool_result" && typeof content.tool_use_id === "string") {
        entries.push(timestamped({
          kind: "tool_result",
          messageId,
          toolId: content.tool_use_id,
          content: content.content,
          isError: Boolean(content.is_error),
          debugRaw,
        }))
      }
      if (message.message.role === "user" && typeof message.message.content === "string") {
        entries.push(timestamped({
          kind: "compact_summary",
          messageId,
          summary: message.message.content,
          debugRaw,
        }))
      }
    }
    return entries
  }

  if (message.type === "result") {
    if (message.subtype === "cancelled") {
      return [timestamped({ kind: "interrupted", messageId, debugRaw })]
    }
    return [
      timestamped({
        kind: "result",
        messageId,
        subtype: message.is_error ? "error" : "success",
        isError: Boolean(message.is_error),
        durationMs: typeof message.duration_ms === "number" ? message.duration_ms : 0,
        result: typeof message.result === "string" ? message.result : stringFromUnknown(message.result),
        costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : undefined,
        debugRaw,
      }),
    ]
  }

  if (message.type === "system" && message.subtype === "status" && typeof message.status === "string") {
    return [timestamped({ kind: "status", messageId, status: message.status, debugRaw })]
  }

  if (message.type === "system" && message.subtype === "compact_boundary") {
    return [timestamped({ kind: "compact_boundary", messageId, debugRaw })]
  }

  if (message.type === "system" && message.subtype === "context_cleared") {
    return [timestamped({ kind: "context_cleared", messageId, debugRaw })]
  }

  if (
    message.type === "user" &&
    message.message?.role === "user" &&
    typeof message.message.content === "string" &&
    message.message.content.startsWith("This session is being continued")
  ) {
    return [timestamped({ kind: "compact_summary", messageId, summary: message.message.content, debugRaw })]
  }

  return []
}

export async function* createClaudeHarnessStream(q: Query): AsyncGenerator<HarnessEvent> {
  for await (const sdkMessage of q as AsyncIterable<any>) {
    const sessionToken = typeof sdkMessage.session_id === "string" ? sdkMessage.session_id : null
    if (sessionToken) {
      yield { type: "session_token", sessionToken }
    }
    for (const entry of normalizeClaudeStreamMessage(sdkMessage)) {
      yield { type: "transcript", entry }
    }
  }
}

export async function startClaudeTurn(args: {
  content: string
  localPath: string
  model: string
  effort?: string
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  orchestrator?: SessionOrchestrator
  chatId?: string
  store?: CoordinationStore
  sdk?: ClaudeSdkBinding
  extraEnv?: Record<string, string>
  /** Injected binary resolver; defaults to the real resolve-binary.adapter. Tests override this. */
  _resolveBinary?: typeof resolveClaudeBinary
}): Promise<HarnessTurn> {
  const options = await createClaudeOptions(args)
  const sdk = args.sdk ?? (ClaudeAgentSdk as ClaudeSdkBinding)

  const q = sdk.startup
    ? (await sdk.startup({ options })).query(args.content)
    : sdk.query({ prompt: args.content, options })

  return {
    provider: "claude",
    stream: createClaudeHarnessStream(q),
    getAccountInfo: async () => {
      try {
        return await q.accountInfo()
      } catch {
        return null
      }
    },
    getContextUsage: async () => {
      try {
        const usage = await q.getContextUsage()
        return { percentage: usage.percentage, totalTokens: usage.totalTokens, maxTokens: usage.maxTokens }
      } catch {
        return null
      }
    },
    interrupt: async () => {
      await q.interrupt()
    },
    close: () => {
      q.close()
    },
  }
}

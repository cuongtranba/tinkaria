import { hydrateToolResult } from "../../shared/tools"
import type { HydratedToolCall, HydratedTranscriptMessage, NormalizedToolCall, TranscriptEntry } from "../../shared/types"

function createTimestamp(createdAt: number): string {
  return new Date(createdAt).toISOString()
}

function createBaseMessage(entry: TranscriptEntry) {
  return {
    id: entry._id,
    messageId: entry.messageId,
    timestamp: createTimestamp(entry.createdAt),
    hidden: entry.hidden,
  }
}

function hydrateToolCall(entry: Extract<TranscriptEntry, { kind: "tool_call" }>): HydratedToolCall {
  return {
    id: entry._id,
    messageId: entry.messageId,
    hidden: entry.hidden,
    kind: "tool",
    toolKind: entry.tool.toolKind,
    toolName: entry.tool.toolName,
    toolId: entry.tool.toolId,
    input: entry.tool.input as HydratedToolCall["input"],
    timestamp: createTimestamp(entry.createdAt),
  } as HydratedToolCall
}

function getStructuredToolResultFromDebug(entry: Extract<TranscriptEntry, { kind: "tool_result" }>): unknown {
  if (!entry.debugRaw) return undefined

  try {
    const parsed = JSON.parse(entry.debugRaw) as { tool_use_result?: unknown }
    return parsed.tool_use_result
  } catch (_error: unknown) {
    return undefined
  }
}

function hydrateEntry(
  entry: TranscriptEntry,
  pendingToolCalls: Map<string, { hydrated: HydratedToolCall; normalized: NormalizedToolCall }>,
): HydratedTranscriptMessage | null {
  switch (entry.kind) {
    case "user_prompt":
      return {
        ...createBaseMessage(entry),
        kind: "user_prompt",
        content: entry.content,
      }
    case "system_init":
      return {
        ...createBaseMessage(entry),
        kind: "system_init",
        provider: entry.provider,
        model: entry.model,
        tools: entry.tools,
        agents: entry.agents,
        slashCommands: entry.slashCommands,
        mcpServers: entry.mcpServers,
        debugRaw: entry.debugRaw,
      }
    case "account_info":
      return {
        ...createBaseMessage(entry),
        kind: "account_info",
        accountInfo: entry.accountInfo,
      }
    case "assistant_text":
      return {
        ...createBaseMessage(entry),
        kind: "assistant_text",
        text: entry.text,
      }
    case "tool_call": {
      const toolCall = hydrateToolCall(entry)
      pendingToolCalls.set(entry.tool.toolId, { hydrated: toolCall, normalized: entry.tool })
      return toolCall
    }
    case "tool_result": {
      const pendingCall = pendingToolCalls.get(entry.toolId)
      if (pendingCall) {
        // For ask_user_question and exit_plan_mode, the runner publishes a structured
        // tool_result (with { questions, answers }) BEFORE the Claude SDK echoes back
        // its own tool_result (which may be a plain string or differently shaped).
        // If we already have a result with structured answers, keep it — the SDK-echoed
        // entry would overwrite it with a lossy representation.
        const isStructuredTool =
          pendingCall.normalized.toolKind === "ask_user_question" ||
          pendingCall.normalized.toolKind === "exit_plan_mode"
        if (isStructuredTool && pendingCall.hydrated.result != null) {
          return null
        }

        const rawResult = isStructuredTool
          ? getStructuredToolResultFromDebug(entry) ?? entry.content
          : entry.content

        pendingCall.hydrated.result = hydrateToolResult(pendingCall.normalized, rawResult) as never
        pendingCall.hydrated.rawResult = rawResult
        pendingCall.hydrated.isError = entry.isError
      }
      return null
    }
    case "result":
      return {
        ...createBaseMessage(entry),
        kind: "result",
        success: !entry.isError,
        cancelled: entry.subtype === "cancelled",
        result: entry.result,
        durationMs: entry.durationMs,
        costUsd: entry.costUsd,
      }
    case "status":
      return {
        ...createBaseMessage(entry),
        kind: "status",
        status: entry.status,
      }
    case "compact_boundary":
      return {
        ...createBaseMessage(entry),
        kind: "compact_boundary",
      }
    case "compact_summary":
      return {
        ...createBaseMessage(entry),
        kind: "compact_summary",
        summary: entry.summary,
      }
    case "context_cleared":
      return {
        ...createBaseMessage(entry),
        kind: "context_cleared",
      }
    case "context_usage":
      return null
    case "interrupted":
      return {
        ...createBaseMessage(entry),
        kind: "interrupted",
      }
    case "rate_limit":
      return {
        ...createBaseMessage(entry),
        kind: "rate_limit",
        rateLimit: entry.rateLimit,
      }
    default:
      return {
        ...createBaseMessage(entry),
        kind: "unknown",
        json: JSON.stringify(entry, null, 2),
      }
  }
}

export function processTranscriptMessages(entries: TranscriptEntry[]): HydratedTranscriptMessage[] {
  const pendingToolCalls = new Map<string, { hydrated: HydratedToolCall; normalized: NormalizedToolCall }>()
  const messages: HydratedTranscriptMessage[] = []

  for (const entry of entries) {
    const msg = hydrateEntry(entry, pendingToolCalls)
    if (msg) {
      messages.push(msg)
    }
  }

  return messages
}

export interface IncrementalHydrator {
  hydrate(entry: TranscriptEntry): HydratedTranscriptMessage | null
  getMessages(): HydratedTranscriptMessage[]
  reset(): void
}

export function createIncrementalHydrator(): IncrementalHydrator {
  let pendingToolCalls = new Map<string, { hydrated: HydratedToolCall; normalized: NormalizedToolCall }>()
  let messages: HydratedTranscriptMessage[] = []
  let seenEntryIds = new Set<string>()
  let dirty = false

  return {
    hydrate(entry: TranscriptEntry): HydratedTranscriptMessage | null {
      if (seenEntryIds.has(entry._id)) return null
      seenEntryIds.add(entry._id)

      const msg = hydrateEntry(entry, pendingToolCalls)
      if (msg) {
        messages.push(msg)
        dirty = true
      } else if (entry.kind === "tool_result") {
        // tool_result mutates an existing tool call in-place — mark dirty
        // so getMessages() returns a new reference for React's identity check
        dirty = true
      }
      return msg
    },

    getMessages(): HydratedTranscriptMessage[] {
      if (dirty) {
        messages = [...messages] // snapshot for React identity check
        dirty = false
      }
      return messages
    },

    reset(): void {
      pendingToolCalls = new Map()
      messages = []
      seenEntryIds = new Set()
      dirty = false
    },
  }
}

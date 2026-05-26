import { hydrateToolResult } from "./tools"
import type {
  HydratedPresentContentToolCall,
  HydratedToolCall,
  HydratedTranscriptMessage,
  NormalizedToolCall,
  TranscriptEntry,
  TranscriptRenderUnit,
  TranscriptRenderUnitKind,
} from "./types"

export interface TranscriptRenderFoldOptions {
  isLoading?: boolean
}

type PendingToolCall = {
  hydrated: HydratedToolCall
  normalized: NormalizedToolCall
  sourceEntryIds: string[]
}

type RenderMessage = {
  message: HydratedTranscriptMessage
  sourceEntryIds: string[]
}

const DEDICATED_TOOL_KINDS = new Set([
  "ask_user_question",
  "exit_plan_mode",
  "todo_write",
  "present_content",
])

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

function hydrateTranscriptEntries(entries: TranscriptEntry[]): RenderMessage[] {
  const pendingToolCalls = new Map<string, PendingToolCall>()
  const messages: RenderMessage[] = []

  for (const entry of entries) {
    switch (entry.kind) {
      case "user_prompt":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "user_prompt", content: entry.content },
          sourceEntryIds: [entry._id],
        })
        break
      case "system_init":
        messages.push({
          message: {
            ...createBaseMessage(entry),
            kind: "system_init",
            provider: entry.provider,
            model: entry.model,
            tools: entry.tools,
            agents: entry.agents,
            slashCommands: entry.slashCommands,
            mcpServers: entry.mcpServers,
            debugRaw: entry.debugRaw,
          },
          sourceEntryIds: [entry._id],
        })
        break
      case "account_info":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "account_info", accountInfo: entry.accountInfo },
          sourceEntryIds: [entry._id],
        })
        break
      case "assistant_text":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "assistant_text", text: entry.text },
          sourceEntryIds: [entry._id],
        })
        break
      case "tool_call": {
        const hydrated = hydrateToolCall(entry)
        const tracked = { hydrated, normalized: entry.tool, sourceEntryIds: [entry._id] }
        pendingToolCalls.set(entry.tool.toolId, tracked)
        messages.push({ message: hydrated, sourceEntryIds: tracked.sourceEntryIds })
        break
      }
      case "tool_result": {
        const pendingCall = pendingToolCalls.get(entry.toolId)
        if (pendingCall) {
          const isStructuredTool =
            pendingCall.normalized.toolKind === "ask_user_question" ||
            pendingCall.normalized.toolKind === "exit_plan_mode"
          if (!(isStructuredTool && pendingCall.hydrated.result != null)) {
            const rawResult = isStructuredTool
              ? getStructuredToolResultFromDebug(entry) ?? entry.content
              : entry.content
            pendingCall.hydrated.result = hydrateToolResult(pendingCall.normalized, rawResult) as never
            pendingCall.hydrated.rawResult = rawResult
            pendingCall.hydrated.isError = entry.isError
          }
          pendingCall.sourceEntryIds.push(entry._id)
        }
        break
      }
      case "result":
        messages.push({
          message: {
            ...createBaseMessage(entry),
            kind: "result",
            success: !entry.isError,
            cancelled: entry.subtype === "cancelled",
            result: entry.result,
            durationMs: entry.durationMs,
            costUsd: entry.costUsd,
          },
          sourceEntryIds: [entry._id],
        })
        break
      case "status":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "status", status: entry.status },
          sourceEntryIds: [entry._id],
        })
        break
      case "compact_boundary":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "compact_boundary" },
          sourceEntryIds: [entry._id],
        })
        break
      case "compact_summary":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "compact_summary", summary: entry.summary },
          sourceEntryIds: [entry._id],
        })
        break
      case "context_cleared":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "context_cleared" },
          sourceEntryIds: [entry._id],
        })
        break
      case "interrupted":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "interrupted" },
          sourceEntryIds: [entry._id],
        })
        break
      case "context_usage":
        break
      case "context_window_updated":
        break
      case "agent_result":
        messages.push({
          message: { ...createBaseMessage(entry), kind: "unknown", json: JSON.stringify(entry, null, 2) },
          sourceEntryIds: [entry._id],
        })
        break
      default: {
        const _exhaustive: never = entry
        void _exhaustive
      }
    }
  }

  return messages
}

export function getTranscriptRenderUnitId(kind: TranscriptRenderUnitKind, sourceEntryIds: string[]): string {
  const first = sourceEntryIds[0] ?? "empty"
  const last = sourceEntryIds[sourceEntryIds.length - 1] ?? first

  if (kind === "wip_block") return `wip:${first}:${last}`
  if (kind === "tool_group") return `tools:${first}:${last}`
  if (kind === "artifact") return `artifact:${first}`
  if (kind === "unknown") return `unknown:${first}`
  return `${kind}:${first}`
}

function isToolMessage(message: HydratedTranscriptMessage): message is HydratedToolCall {
  return message.kind === "tool"
}

function isWorkTool(message: HydratedTranscriptMessage): message is HydratedToolCall {
  if (!isToolMessage(message)) return false
  if (message.isError) return false
  if (message.toolKind === "unknown_tool") return false
  return !DEDICATED_TOOL_KINDS.has(message.toolKind)
}

function isStandaloneTool(message: HydratedTranscriptMessage): message is HydratedToolCall {
  if (!isToolMessage(message)) return false
  return !isWorkTool(message)
}

function shouldEjectRationaleBefore(message: HydratedTranscriptMessage): boolean {
  if (!isStandaloneTool(message)) return false
  if (message.toolKind === "todo_write") return false
  return true
}

function isWipAbsorbable(message: HydratedTranscriptMessage): boolean {
  return message.kind === "assistant_text" || isWorkTool(message)
}

function findAnswerIndex(items: RenderMessage[], isLoading: boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]!.message.kind !== "assistant_text") continue
    if (!isLoading) return index

    let hasToolAfter = false
    for (let cursor = index + 1; cursor < items.length; cursor += 1) {
      if (items[cursor]!.message.kind === "tool") {
        hasToolAfter = true
        break
      }
    }
    if (hasToolAfter) break

    if (index === items.length - 1) {
      let hasPriorAssistant = false
      let hasPriorTool = false
      for (let cursor = 0; cursor < index; cursor += 1) {
        if (items[cursor]!.message.kind === "tool") hasPriorTool = true
        if (items[cursor]!.message.kind === "assistant_text") hasPriorAssistant = true
      }
      if (hasPriorTool) return index
      if (hasPriorAssistant) return -1
    }
    return index
  }
  return -1
}

function collectSourceEntryIds(items: RenderMessage[]): string[] {
  return items.flatMap((item) => item.sourceEntryIds)
}

function createSingleUnit(item: RenderMessage, kind: Exclude<TranscriptRenderUnitKind, "wip_block" | "tool_group">): TranscriptRenderUnit {
  const id = getTranscriptRenderUnitId(kind, item.sourceEntryIds)

  switch (kind) {
    case "user_prompt":
    case "system_init":
    case "account_info":
    case "status":
    case "result":
    case "compact_boundary":
    case "compact_summary":
    case "context_cleared":
    case "interrupted":
    case "unknown":
      return { kind, id, sourceEntryIds: item.sourceEntryIds, message: item.message } as TranscriptRenderUnit
    case "assistant_response":
      return { kind, id, sourceEntryIds: item.sourceEntryIds, message: item.message } as TranscriptRenderUnit
    case "standalone_tool":
      return { kind, id, sourceEntryIds: item.sourceEntryIds, tool: item.message as HydratedToolCall }
    case "artifact":
      return { kind, id, sourceEntryIds: item.sourceEntryIds, artifact: item.message as HydratedPresentContentToolCall }
  }
}

function getLatestVisibleIndices(items: RenderMessage[]): { latestStatusIndex: number; latestTodoWriteIndex: number } {
  let latestStatusIndex = -1
  let latestTodoWriteIndex = -1

  for (let index = 0; index < items.length; index += 1) {
    const message = items[index]!.message
    if (message.kind === "status") latestStatusIndex = index
    if (message.kind === "tool" && message.toolKind === "todo_write") latestTodoWriteIndex = index
  }

  return { latestStatusIndex, latestTodoWriteIndex }
}

function shouldSkipSingle(items: RenderMessage[], index: number, latest: ReturnType<typeof getLatestVisibleIndices>): boolean {
  const message = items[index]!.message

  if (message.kind === "status") return index !== latest.latestStatusIndex
  if (message.kind === "account_info") {
    return items.findIndex((item) => item.message.kind === "account_info") !== index
  }
  if (message.kind === "system_init") {
    return items.findIndex((item) => item.message.kind === "system_init") !== index
  }
  if (message.kind === "result") {
    return items[index - 1]?.message.kind === "context_cleared" || items[index + 1]?.message.kind === "context_cleared"
  }
  if (message.kind === "tool" && message.toolKind === "todo_write") {
    return index !== latest.latestTodoWriteIndex
  }
  return false
}

function getSingleKind(message: HydratedTranscriptMessage): Exclude<TranscriptRenderUnitKind, "wip_block" | "tool_group"> {
  switch (message.kind) {
    case "user_prompt":
      return "user_prompt"
    case "system_init":
      return "system_init"
    case "account_info":
      return "account_info"
    case "assistant_text":
      return "assistant_response"
    case "tool":
      return message.toolKind === "present_content" ? "artifact" : "standalone_tool"
    case "result":
      return "result"
    case "status":
      return "status"
    case "compact_boundary":
      return "compact_boundary"
    case "compact_summary":
      return "compact_summary"
    case "context_cleared":
      return "context_cleared"
    case "interrupted":
      return "interrupted"
    case "unknown":
      return "unknown"
    default: {
      const _exhaustive: never = message
      return _exhaustive
    }
  }
}

export function foldTranscriptRenderUnits(
  entries: TranscriptEntry[],
  options: TranscriptRenderFoldOptions = {},
): TranscriptRenderUnit[] {
  const items = hydrateTranscriptEntries(entries)
  const result: TranscriptRenderUnit[] = []
  const answerIndex = findAnswerIndex(items, options.isLoading === true)
  const latest = getLatestVisibleIndices(items)
  let index = 0

  let deferredStatus: TranscriptRenderUnit | null = null

  while (index < items.length) {
    const item = items[index]!
    const message = item.message

    if (shouldSkipSingle(items, index, latest)) {
      index += 1
      continue
    }

    if (message.kind === "status") {
      deferredStatus = createSingleUnit(item, "status")
      index += 1
      continue
    }

    if (message.kind === "assistant_text" && index !== answerIndex) {
      const steps: RenderMessage[] = [item]
      index += 1

      while (
        index < items.length &&
        index !== answerIndex &&
        !shouldSkipSingle(items, index, latest) &&
        isWipAbsorbable(items[index]!.message)
      ) {
        steps.push(items[index]!)
        index += 1
      }

      const ejected: RenderMessage[] = []
      if (index < items.length && shouldEjectRationaleBefore(items[index]!.message)) {
        while (steps.length > 0 && steps[steps.length - 1]!.message.kind === "assistant_text") {
          ejected.unshift(steps.pop()!)
        }
      }

      if (steps.length >= 2 || (options.isLoading === true && steps.length >= 1)) {
        const sourceEntryIds = collectSourceEntryIds(steps)
        result.push({
          kind: "wip_block",
          id: getTranscriptRenderUnitId("wip_block", sourceEntryIds),
          sourceEntryIds,
          steps: steps.map((step) => step.message),
        })
      } else if (steps.length === 1) {
        result.push(createSingleUnit(steps[0]!, getSingleKind(steps[0]!.message)))
      }

      for (const ejectedItem of ejected) {
        result.push(createSingleUnit(ejectedItem, "assistant_response"))
      }
      continue
    }

    if (isWorkTool(message)) {
      const tools: RenderMessage[] = [item]
      index += 1
      while (
        index < items.length &&
        !shouldSkipSingle(items, index, latest) &&
        isWorkTool(items[index]!.message)
      ) {
        tools.push(items[index]!)
        index += 1
      }
      if (tools.length >= 2) {
        const sourceEntryIds = collectSourceEntryIds(tools)
        result.push({
          kind: "tool_group",
          id: getTranscriptRenderUnitId("tool_group", sourceEntryIds),
          sourceEntryIds,
          tools: tools.map((tool) => tool.message as HydratedToolCall),
        })
      } else {
        result.push(createSingleUnit(tools[0]!, "standalone_tool"))
      }
      continue
    }

    result.push(createSingleUnit(item, getSingleKind(message)))
    index += 1
  }

  if (deferredStatus) result.push(deferredStatus)

  return result
}

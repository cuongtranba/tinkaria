import { normalizeToolCall } from "../../shared/tools"
import type {
  ContextWindowUsageSnapshot,
  SlashCommand,
  TranscriptEntry,
} from "../../shared/types"
import type { HarnessEvent } from "../harness-types"
import { ClaudeLimitDetector } from "./../auto-continue/limit-detector"

export interface ClaudeSessionHandle {
  provider: "claude"
  stream: AsyncIterable<HarnessEvent>
  getAccountInfo?: () => Promise<unknown>
  interrupt: () => Promise<void>
  close: () => void
  sendPrompt: (content: string) => Promise<void>
  setModel: (model: string) => Promise<void>
  setPermissionMode: (planMode: boolean) => Promise<void>
  getSupportedCommands: () => Promise<SlashCommand[]>
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object") return null
  return v as Record<string, unknown>
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

export function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
  createdAt = Date.now(),
): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt,
    ...entry,
  } as TranscriptEntry
}

export function normalizeClaudeUsageSnapshot(
  value: unknown,
  maxTokens?: number,
): ContextWindowUsageSnapshot | null {
  const usage = asRecord(value)
  if (!usage) return null

  const directInputTokens = asNumber(usage.input_tokens) ?? asNumber(usage.inputTokens) ?? 0
  const cacheCreationInputTokens =
    asNumber(usage.cache_creation_input_tokens) ?? asNumber(usage.cacheCreationInputTokens) ?? 0
  const cacheReadInputTokens =
    asNumber(usage.cache_read_input_tokens) ?? asNumber(usage.cacheReadInputTokens) ?? 0
  const outputTokens = asNumber(usage.output_tokens) ?? asNumber(usage.outputTokens) ?? 0
  const reasoningOutputTokens =
    asNumber(usage.reasoning_output_tokens) ?? asNumber(usage.reasoningOutputTokens)
  const toolUses = asNumber(usage.tool_uses) ?? asNumber(usage.toolUses)
  const durationMs = asNumber(usage.duration_ms) ?? asNumber(usage.durationMs)

  const inputTokens = directInputTokens + cacheCreationInputTokens + cacheReadInputTokens
  const usedTokens = inputTokens + outputTokens
  if (usedTokens <= 0) return null

  return {
    usedTokens,
    inputTokens,
    ...(cacheReadInputTokens > 0 ? { cachedInputTokens: cacheReadInputTokens } : {}),
    ...(outputTokens > 0 ? { outputTokens } : {}),
    ...(reasoningOutputTokens !== undefined ? { reasoningOutputTokens } : {}),
    lastUsedTokens: usedTokens,
    lastInputTokens: inputTokens,
    ...(cacheReadInputTokens > 0 ? { lastCachedInputTokens: cacheReadInputTokens } : {}),
    ...(outputTokens > 0 ? { lastOutputTokens: outputTokens } : {}),
    ...(reasoningOutputTokens !== undefined ? { lastReasoningOutputTokens: reasoningOutputTokens } : {}),
    ...(toolUses !== undefined ? { toolUses } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(typeof maxTokens === "number" && maxTokens > 0 ? { maxTokens } : {}),
    compactsAutomatically: false,
  } as ContextWindowUsageSnapshot
}

export function resolveFinalTurnUsage(
  latestUsageSnapshot: ContextWindowUsageSnapshot | null,
  accumulatedUsage: ContextWindowUsageSnapshot | null,
  lastKnownContextWindow: number | undefined,
): ContextWindowUsageSnapshot | null {
  if (!latestUsageSnapshot) return null
  return {
    ...latestUsageSnapshot,
    ...(typeof lastKnownContextWindow === "number" ? { maxTokens: lastKnownContextWindow } : {}),
    ...(accumulatedUsage && accumulatedUsage.usedTokens > latestUsageSnapshot.usedTokens
      ? { totalProcessedTokens: accumulatedUsage.usedTokens }
      : {}),
  } as ContextWindowUsageSnapshot
}

export function maxClaudeContextWindowFromModelUsage(modelUsage: unknown): number | undefined {
  const record = asRecord(modelUsage)
  if (!record) return undefined
  let maxContextWindow: number | undefined
  for (const value of Object.values(record)) {
    const usage = asRecord(value)
    const contextWindow = asNumber(usage?.contextWindow) ?? asNumber(usage?.context_window)
    if (contextWindow === undefined) continue
    maxContextWindow = Math.max(maxContextWindow ?? 0, contextWindow)
  }
  return maxContextWindow
}

export function parseConfiguredContextWindowFromModelId(modelId: string): number | undefined {
  return modelId.endsWith("[1m]") ? 1_000_000 : undefined
}

export function getClaudeAssistantMessageUsageId(message: unknown): string | null {
  const m = asRecord(message)
  if (!m) return null
  const inner = asRecord(m.message)
  if (inner && typeof inner.id === "string" && inner.id) return inner.id
  if (typeof m.uuid === "string" && m.uuid) return m.uuid as string
  return null
}

/**
 * Stateful SDK → HarnessEvent stream. Implements the same D1/D2/D3 logic as
 * `createJsonlEventParser` so PTY and SDK paths produce identical event
 * sequences for any given message fixture.
 *
 * D1 — assistant usage → context_window_updated (deduped by message id);
 *       result → final context_window_updated with resolved context window.
 * D2 — rate_limit_event → rate_limit event.
 * D3 — session_token emitted for every message carrying a session_id.
 */
export async function* createClaudeHarnessStream(
  source: AsyncIterable<unknown>,
  configuredContextWindow?: number,
): AsyncIterable<HarnessEvent> {
  let seenAssistantUsageIds = new Set<string>()
  let latestUsageSnapshot: ContextWindowUsageSnapshot | null = null
  let lastKnownContextWindow: number | undefined = configuredContextWindow
  const detector = new ClaudeLimitDetector()

  for await (const message of source) {
    const m = asRecord(message)
    if (!m) continue

    // D3 — session_token for every message carrying a session_id.
    if (typeof m.session_id === "string" && m.session_id.length > 0) {
      yield { type: "session_token", sessionToken: m.session_id }
    }

    // D2 — rate_limit_event (SDK-native shape).
    if (m.type === "rate_limit_event") {
      const detection = detector.detectFromSdkRateLimitInfo(
        "",
        (m as { rate_limit_info?: unknown }).rate_limit_info,
      )
      if (detection) {
        yield { type: "rate_limit", rateLimit: { resetAt: detection.resetAt, tz: detection.tz } }
      }
    }

    // D1 — assistant usage delta → context_window_updated (deduped by message id).
    if (m.type === "assistant") {
      const usageId = getClaudeAssistantMessageUsageId(m)
      const usageSnapshot = normalizeClaudeUsageSnapshot(
        (m as { usage?: unknown }).usage,
        lastKnownContextWindow,
      )
      if (usageId && usageSnapshot && !seenAssistantUsageIds.has(usageId)) {
        seenAssistantUsageIds.add(usageId)
        latestUsageSnapshot = usageSnapshot
        yield {
          type: "transcript",
          entry: timestamped({ kind: "context_window_updated", usage: usageSnapshot }),
        }
      }
    }

    // D1 — result → final context_window_updated, then reset turn state.
    if (m.type === "result") {
      const resultContextWindow = maxClaudeContextWindowFromModelUsage(
        (m as { modelUsage?: unknown }).modelUsage,
      )
      if (resultContextWindow !== undefined) {
        lastKnownContextWindow = Math.max(lastKnownContextWindow ?? 0, resultContextWindow)
      }
      const accumulatedUsage = normalizeClaudeUsageSnapshot(
        (m as { usage?: unknown }).usage,
        lastKnownContextWindow,
      )
      const finalUsage = resolveFinalTurnUsage(latestUsageSnapshot, accumulatedUsage, lastKnownContextWindow)
      if (finalUsage) {
        yield {
          type: "transcript",
          entry: timestamped({ kind: "context_window_updated", usage: finalUsage }),
        }
      }
      seenAssistantUsageIds = new Set<string>()
      latestUsageSnapshot = null
    }

    // Transcript entries (system_init, assistant_text, tool_call, tool_result, etc.)
    for (const entry of normalizeClaudeStreamMessage(message)) {
      yield { type: "transcript", entry }
    }
  }
}

export function normalizeClaudeStreamMessage(message: unknown): TranscriptEntry[] {
  const m = asRecord(message)
  if (!m) return []
  const uuid = typeof m.uuid === "string" ? m.uuid : undefined
  const inner = asRecord(m.message)

  if (m.type === "system" && (m as Record<string, unknown>).subtype === "init") {
    return [
      timestamped({
        kind: "system_init",
        messageId: uuid,
        provider: "claude",
        model: typeof m.model === "string" ? m.model : "unknown",
        tools: Array.isArray(m.tools) ? m.tools : [],
        agents: Array.isArray((m as Record<string, unknown>).agents) ? (m as Record<string, unknown>).agents as unknown[] : [],
        slashCommands: Array.isArray((m as Record<string, unknown>).slash_commands)
          ? ((m as Record<string, unknown>).slash_commands as string[]).filter((e) => !e.startsWith("._"))
          : [],
        mcpServers: Array.isArray((m as Record<string, unknown>).mcp_servers)
          ? (m as Record<string, unknown>).mcp_servers as unknown[]
          : [],
        debugRaw: JSON.stringify(m),
      } as Omit<TranscriptEntry, "_id" | "createdAt">),
    ]
  }

  // claude-code TUI JSONL: assistant message with content array.
  // Emits one entry per content block: text → assistant_text,
  // tool_use → tool_call. Matches kanna's session-mapper.
  if (m.type === "assistant" && inner) {
    const out: TranscriptEntry[] = []
    const content = Array.isArray(inner.content) ? inner.content : []
    const messageId = typeof inner.id === "string" ? inner.id : uuid
    for (const block of content) {
      const b = asRecord(block)
      if (!b) continue
      if (b.type === "text" && typeof b.text === "string" && b.text.length > 0) {
        out.push(timestamped({
          kind: "assistant_text",
          text: b.text,
          messageId,
        } as Omit<TranscriptEntry, "_id" | "createdAt">))
        continue
      }
      if (b.type === "tool_use" && typeof b.name === "string" && typeof b.id === "string") {
        const input = asRecord(b.input) ?? {}
        const tool = normalizeToolCall({ toolName: b.name, toolId: b.id, input })
        out.push(timestamped({
          kind: "tool_call",
          tool,
          messageId,
        } as Omit<TranscriptEntry, "_id" | "createdAt">))
      }
    }
    return out
  }

  // claude-code TUI JSONL: user record with tool_result blocks (no user_prompt;
  // server's chat.send already records the user message, so a synthetic text
  // user_prompt would duplicate it). tool_result blocks pair with tool_call.
  if (m.type === "user" && inner) {
    const out: TranscriptEntry[] = []
    const content = Array.isArray(inner.content) ? inner.content : []
    for (const block of content) {
      const b = asRecord(block)
      if (!b) continue
      if (b.type !== "tool_result") continue
      const toolId = typeof b.tool_use_id === "string" ? b.tool_use_id : ""
      if (!toolId) continue
      const raw = b.content
      const resultContent = typeof raw === "string"
        ? raw
        : raw === undefined || raw === null
          ? null
          : raw
      out.push(timestamped({
        kind: "tool_result",
        toolId,
        content: resultContent,
        isError: b.is_error === true,
      } as Omit<TranscriptEntry, "_id" | "createdAt">))
    }
    return out
  }

  // claude-code TUI JSONL: turn end marker.
  if (m.type === "system" && (m as Record<string, unknown>).subtype === "turn_duration") {
    const durationMs = typeof (m as Record<string, unknown>).durationMs === "number"
      ? (m as Record<string, unknown>).durationMs as number
      : 0
    return [timestamped({
      kind: "result",
      success: true,
      result: "",
      durationMs,
      messageId: uuid,
    } as Omit<TranscriptEntry, "_id" | "createdAt">)]
  }

  return []
}

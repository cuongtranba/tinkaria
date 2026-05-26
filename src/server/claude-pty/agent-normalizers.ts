import type {
  ContextWindowUsageSnapshot,
  SlashCommand,
  TranscriptEntry,
} from "../../shared/types"
import type { HarnessEvent } from "../harness-types"

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
 * MINIMAL PORT: kanna's `normalizeClaudeStreamMessage` returns full
 * TranscriptEntry[] derived from claude-agent-sdk message shape. The
 * full mapper is ~250 LOC and pulls in tool-call / attachment / thinking
 * normalizers. For the PTY driver bring-up we only need to surface
 * system_init (slash commands) — assistant/result mapping is delegated
 * to `jsonl-to-event.ts` which is the PTY-native parser. This stub
 * keeps the import surface intact; replace with full port if SDK-based
 * provider also routes through here.
 */
/**
 * MINIMAL stub for parity-matrix test compatibility. Full SDK→HarnessEvent
 * translation lives in the upstream SDK provider; PTY's own path goes
 * through `jsonl-to-event.ts`.
 */
export async function* createClaudeHarnessStream(
  source: AsyncIterable<unknown>,
  _configuredContextWindow?: number,
): AsyncIterable<HarnessEvent> {
  for await (const message of source) {
    for (const entry of normalizeClaudeStreamMessage(message)) {
      yield { type: "transcript", entry }
    }
  }
}

export function normalizeClaudeStreamMessage(message: unknown): TranscriptEntry[] {
  const m = asRecord(message)
  if (!m) return []
  if (m.type === "system" && (m as Record<string, unknown>).subtype === "init") {
    const messageId = typeof m.uuid === "string" ? m.uuid : undefined
    return [
      timestamped({
        kind: "system_init",
        messageId,
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
  return []
}

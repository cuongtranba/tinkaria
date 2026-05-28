import { readdir, stat, open } from "node:fs/promises"
import { join, extname } from "node:path"
import { homedir } from "node:os"
import type {
  AgentProvider,
  DiscoveredSessionRuntime,
  DiscoveredSessionTokenUsage,
  DiscoveredSessionUsageBucket,
  TranscriptEntry,
} from "../shared/types"
import { timestamped } from "../shared/transcript-entries"

const TAIL_BYTES = 32 * 1024

function joinSnippetParts(parts: Array<string | null>, maxLength: number): string | null {
  const combined = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim()

  if (!combined) return null
  return combined.slice(0, maxLength)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}


function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line)
    return isRecord(parsed) ? parsed : null
  } catch (_error: unknown) {
    return null
  }
}

export function extractContentText(value: unknown, maxLength: number): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed.slice(0, maxLength) : null
  }

  if (Array.isArray(value)) {
    return joinSnippetParts(value.map((entry) => extractContentText(entry, maxLength)), maxLength)
  }

  if (!isRecord(value)) return null

  if (typeof value.text === "string") {
    const trimmed = value.text.trim()
    if (trimmed) return trimmed.slice(0, maxLength)
  }

  if ("content" in value) {
    const contentText = extractContentText(value.content, maxLength)
    if (contentText) return contentText
  }

  if ("message" in value) {
    const messageText = extractContentText(value.message, maxLength)
    if (messageText) return messageText
  }

  return null
}

function formatUsageBucketLabel(windowMinutes: number, fallback: string): string {
  if (windowMinutes % (60 * 24) === 0) return `${windowMinutes / (60 * 24)}d`
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`
  return fallback
}

function extractClaudeRuntime(tailContent: string): DiscoveredSessionRuntime | undefined {
  const lines = tailContent.split("\n").filter(Boolean)
  let model: string | undefined
  let tokenUsage: DiscoveredSessionTokenUsage | undefined

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (model && tokenUsage) break

    const parsed = parseJsonLine(lines[index])
    if (!parsed) continue

    if (!model && normalizeString(parsed.type) === "assistant") {
      const message = isRecord(parsed.message) ? parsed.message : null
      model = normalizeString(message?.model)
      continue
    }

    if (!tokenUsage && normalizeString(parsed.kind) === "context_usage") {
      const contextUsage = isRecord(parsed.contextUsage) ? parsed.contextUsage : null
      const percentage = normalizeNumber(contextUsage?.percentage)
      const totalTokens = normalizeNumber(contextUsage?.totalTokens)
      const maxTokens = normalizeNumber(contextUsage?.maxTokens)
      if (totalTokens !== undefined) {
        tokenUsage = {
          totalTokens,
          ...(maxTokens !== undefined ? { contextWindow: maxTokens } : {}),
          ...(percentage !== undefined ? { estimatedContextPercent: percentage } : {}),
        }
      }
    }
  }

  if (!model && !tokenUsage) return undefined
  return {
    ...(model ? { model } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
  }
}

function extractCodexRuntime(tailContent: string): DiscoveredSessionRuntime | undefined {
  const lines = tailContent.split("\n").filter(Boolean)
  let model: string | undefined
  let tokenUsage: DiscoveredSessionTokenUsage | undefined
  let usageBuckets: DiscoveredSessionUsageBucket[] | undefined

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index])
    if (!parsed) continue

    const type = normalizeString(parsed.type)
    if (!model && type === "turn_context") {
      const payload = isRecord(parsed.payload) ? parsed.payload : null
      model = normalizeString(payload?.model)
      continue
    }

    if ((tokenUsage || usageBuckets) || type !== "event_msg") continue

    const payload = isRecord(parsed.payload) ? parsed.payload : null
    if (normalizeString(payload?.type) !== "token_count") continue

    const info = isRecord(payload?.info) ? payload.info : null
    const totalTokenUsage = isRecord(info?.total_token_usage) ? info.total_token_usage : null
    const totalTokens = normalizeNumber(totalTokenUsage?.total_tokens)
    const contextWindow = normalizeNumber(info?.model_context_window)
    const lastTokenUsage = isRecord(info?.last_token_usage) ? info.last_token_usage : null
    const lastTokens = normalizeNumber(lastTokenUsage?.total_tokens)
    const estimatedContextPercent = contextWindow !== undefined
      ? Math.min(100, Math.round(((lastTokens ?? totalTokens ?? 0) / contextWindow) * 100))
      : undefined

    if (totalTokens !== undefined) {
      tokenUsage = {
        totalTokens,
        ...(contextWindow !== undefined ? { contextWindow } : {}),
        ...(contextWindow !== undefined && totalTokens <= contextWindow
          ? { contextLeft: Math.max(contextWindow - totalTokens, 0) }
          : {}),
        ...(estimatedContextPercent !== undefined ? { estimatedContextPercent } : {}),
      }
    }

    const rateLimits = isRecord(payload?.rate_limits) ? payload.rate_limits : null
    if (rateLimits) {
      const buckets: DiscoveredSessionUsageBucket[] = []
      for (const [key, labelFallback] of [["primary", "5h"], ["secondary", "7d"]] as const) {
        const bucket = isRecord(rateLimits[key]) ? rateLimits[key] : null
        const usedPercent = normalizeNumber(bucket?.used_percent)
        if (usedPercent === undefined) continue
        const windowMinutes = normalizeNumber(bucket?.window_minutes)
        buckets.push({
          label: windowMinutes !== undefined ? formatUsageBucketLabel(windowMinutes, labelFallback) : labelFallback,
          usedPercent,
        })
      }
      if (buckets.length > 0) {
        usageBuckets = buckets
      }
    }
  }

  if (!model && !tokenUsage && !usageBuckets) return undefined

  return {
    ...(model ? { model } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(usageBuckets ? { usageBuckets } : {}),
  }
}

async function readTail(filePath: string, bytes: number): Promise<string> {
  const fh = await open(filePath, "r")
  try {
    const fileStat = await fh.stat()
    const size = fileStat.size
    const readStart = Math.max(0, size - bytes)
    const readLength = Math.min(bytes, size)
    const buffer = Buffer.alloc(readLength)
    await fh.read(buffer, 0, readLength, readStart)
    return buffer.toString("utf-8")
  } finally {
    await fh.close()
  }
}

async function inspectSessionRuntimeFile(
  filePath: string,
  provider: AgentProvider
): Promise<DiscoveredSessionRuntime | null> {
  const tailContent = await readTail(filePath, TAIL_BYTES)
  if (provider === "claude") {
    return extractClaudeRuntime(tailContent) ?? null
  }
  if (provider === "codex") {
    return extractCodexRuntime(tailContent) ?? null
  }
  return null
}

async function readHead(filePath: string, lineCount: number): Promise<string[]> {
  const fh = await open(filePath, "r")
  try {
    const chunkSize = 4096
    const chunks: Buffer[] = []
    let position = 0
    let newlineCount = 0

    while (newlineCount < lineCount) {
      const buffer = Buffer.alloc(chunkSize)
      const { bytesRead } = await fh.read(buffer, 0, chunkSize, position)
      if (bytesRead === 0) break
      const chunk = buffer.subarray(0, bytesRead)
      chunks.push(chunk)
      position += bytesRead

      for (const byte of chunk) {
        if (byte === 10) newlineCount += 1
      }
    }

    const content = Buffer.concat(chunks).toString("utf-8")
    return content.split("\n").slice(0, lineCount)
  } finally {
    await fh.close()
  }
}

async function collectJsonlFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  let dirEntries: import("node:fs").Dirent[]
  try {
    dirEntries = await readdir(dir, { withFileTypes: true })
  } catch (_error: unknown) {
    return []
  }

  for (const entry of dirEntries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await collectJsonlFiles(fullPath)))
    } else if (entry.isFile() && extname(entry.name) === ".jsonl") {
      result.push(fullPath)
    }
  }
  return result
}

function encodeClaudeProjectDir(workspacePath: string): string {
  return join(homedir(), ".claude", "projects", workspacePath.replace(/\//g, "-"))
}

export async function findSessionFile(
  sessionId: string,
  provider: AgentProvider,
  workspacePath: string
): Promise<string | null> {
  if (provider === "claude") {
    const claudeDir = encodeClaudeProjectDir(workspacePath)
    const filePath = join(claudeDir, `${sessionId}.jsonl`)
    try {
      await stat(filePath)
      return filePath
    } catch (_error: unknown) {
      return null
    }
  }

  if (provider === "codex") {
    const sessionsDir = join(homedir(), ".codex", "sessions")
    // Fast path: codex commonly stores a session flat as <sessionId>.jsonl.
    // Hitting it avoids scanning the whole tree (O(n files)).
    const directPath = join(sessionsDir, `${sessionId}.jsonl`)
    try {
      await stat(directPath)
      return directPath
    } catch (_error: unknown) {
      // Not at the flat path — fall back to a recursive scan for nested layouts.
    }
    const files = await collectJsonlFiles(sessionsDir)
    for (const filePath of files) {
      const headLines = await readHead(filePath, 1)
      try {
        const parsed = JSON.parse(headLines[0])
        if (parsed.type === "session_meta" && parsed.payload?.id === sessionId) {
          return filePath
        }
      } catch (_error: unknown) {
        continue
      }
    }
  }

  return null
}

export async function inspectSessionRuntime(
  sessionId: string,
  provider: AgentProvider,
  workspacePath: string
): Promise<DiscoveredSessionRuntime | null> {
  const filePath = await findSessionFile(sessionId, provider, workspacePath)
  if (!filePath) return null
  return inspectSessionRuntimeFile(filePath, provider)
}

function sessionEntryTimestamp(record: Record<string, unknown>): number {
  const rawTimestamp = normalizeString(record.timestamp)
  const parsed = rawTimestamp ? Date.parse(rawTimestamp) : Number.NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function pushSessionEntry(entries: TranscriptEntry[], entry: TranscriptEntry): void {
  const previous = entries.at(-1)
  if (!previous) {
    entries.push(entry)
    return
  }

  if (previous.kind !== entry.kind) {
    entries.push(entry)
    return
  }

  const previousText = previous.kind === "assistant_text"
    ? previous.text
    : previous.kind === "user_prompt"
      ? previous.content
      : null
  const nextText = entry.kind === "assistant_text"
    ? entry.text
    : entry.kind === "user_prompt"
      ? entry.content
      : null

  if (previousText !== null && previousText === nextText) {
    return
  }

  entries.push(entry)
}

function parseClaudeSessionTranscript(lines: string[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []

  for (const line of lines) {
    const parsed = parseJsonLine(line)
    if (!parsed) continue

    const type = normalizeString(parsed.type)
    const message = isRecord(parsed.message) ? parsed.message : null
    if (type === "user") {
      const content = extractContentText(message?.content ?? message, 100_000)
      if (!content) continue
      pushSessionEntry(entries, timestamped({
        kind: "user_prompt",
        content,
      }, sessionEntryTimestamp(parsed)))
      continue
    }

    if (type === "assistant") {
      const text = extractContentText(message?.content ?? message, 100_000)
      if (!text) continue
      pushSessionEntry(entries, timestamped({
        kind: "assistant_text",
        text,
      }, sessionEntryTimestamp(parsed)))
    }
  }

  return entries
}

function parseCodexSessionTranscript(lines: string[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []

  for (const line of lines) {
    const parsed = parseJsonLine(line)
    if (!parsed) continue

    const lineType = normalizeString(parsed.type)
    if (lineType === "event_msg") {
      const payload = isRecord(parsed.payload) ? parsed.payload : null
      const payloadType = normalizeString(payload?.type)
      if (payloadType === "user_message") {
        const content = extractContentText(payload?.message, 100_000)
        if (!content) continue
        pushSessionEntry(entries, timestamped({
          kind: "user_prompt",
          content,
        }, sessionEntryTimestamp(parsed)))
        continue
      }

      if (payloadType === "agent_message") {
        const text = extractContentText(payload?.message, 100_000)
        if (!text) continue
        pushSessionEntry(entries, timestamped({
          kind: "assistant_text",
          text,
        }, sessionEntryTimestamp(parsed)))
      }
      continue
    }

    if (lineType !== "response_item") continue
    const payload = isRecord(parsed.payload) ? parsed.payload : null
    if (normalizeString(payload?.type) !== "message") continue

    const role = normalizeString(payload?.role)
    const content = extractContentText(payload?.content, 100_000)
    if (!content) continue

    if (role === "user") {
      pushSessionEntry(entries, timestamped({
        kind: "user_prompt",
        content,
      }, sessionEntryTimestamp(parsed)))
      continue
    }

    if (role === "assistant") {
      pushSessionEntry(entries, timestamped({
        kind: "assistant_text",
        text: content,
      }, sessionEntryTimestamp(parsed)))
    }
  }

  return entries
}

export async function readSessionTranscript(
  sessionId: string,
  provider: AgentProvider,
  workspacePath: string
): Promise<TranscriptEntry[]> {
  const filePath = await findSessionFile(sessionId, provider, workspacePath)
  if (!filePath) return []

  const raw = await Bun.file(filePath).text()
  const lines = raw.split("\n").filter(Boolean)

  if (provider === "claude") {
    return parseClaudeSessionTranscript(lines)
  }

  if (provider === "codex") {
    return parseCodexSessionTranscript(lines)
  }

  return []
}

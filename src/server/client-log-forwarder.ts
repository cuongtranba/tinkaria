/**
 * Forward browser-shipped logs to VictoriaLogs (decision 0012).
 *
 * The frontend POSTs batches to `/api/logs`; this module sanitizes them
 * (caps count + truncates message size, so a misbehaving/malicious client
 * can't flood the store) and ships them to VictoriaLogs as `source=frontend`.
 * VictoriaLogs stays localhost-only — the browser never reaches it directly.
 *
 * Fire-and-forget: VictoriaLogs being down or `VICTORIALOGS_URL` being unset
 * must never make `/api/logs` fail (the client should never error on logging).
 */

const MAX_RECORDS = 1000
const MAX_MSG_LEN = 8192
const LEVELS = new Set(["debug", "info", "warn", "error"])

export interface SanitizedClientLog {
  _time: string
  _msg: string
  level: string
  source: "frontend"
  component: "browser"
  url: string
}

/**
 * Validate + clamp a raw `/api/logs` body into VL records. Pure.
 * Drops malformed entries; never throws.
 */
export function sanitizeClientLogs(body: unknown, now: Date = new Date()): SanitizedClientLog[] {
  const logs = (body as { logs?: unknown })?.logs
  if (!Array.isArray(logs)) return []
  const out: SanitizedClientLog[] = []
  for (const raw of logs.slice(0, MAX_RECORDS)) {
    if (typeof raw !== "object" || raw === null) continue
    const r = raw as Record<string, unknown>
    const msg = typeof r.msg === "string" ? r.msg.slice(0, MAX_MSG_LEN) : ""
    if (!msg) continue
    const level = typeof r.level === "string" && LEVELS.has(r.level) ? r.level : "info"
    const ts = typeof r.ts === "string" && !Number.isNaN(Date.parse(r.ts)) ? r.ts : now.toISOString()
    const recUrl = typeof r.url === "string" ? r.url.slice(0, 2048) : ""
    out.push({ _time: ts, _msg: msg, level, source: "frontend", component: "browser", url: recUrl })
  }
  return out
}

/** Newline-delimited JSON for VL `/insert/jsonline`. Pure. */
export function buildNdjson(records: SanitizedClientLog[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n")
}

/**
 * Sanitize and ship a `/api/logs` body to VictoriaLogs. Returns the number of
 * accepted records. Never throws; swallows network errors.
 */
export async function forwardClientLogs(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const records = sanitizeClientLogs(body)
  const url = env.VICTORIALOGS_URL?.trim()
  if (records.length === 0 || !url) return records.length
  const endpoint = `${url.replace(/\/$/, "")}/insert/jsonline?_stream_fields=source,component`
  try {
    await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-ndjson" },
      body: buildNdjson(records),
    })
  } catch {
    // observability must never break the ingest endpoint
  }
  return records.length
}

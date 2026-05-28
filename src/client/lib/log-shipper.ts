/**
 * Frontend log shipper → backend `/api/logs` → VictoriaLogs (decision 0012).
 *
 * Captures browser `console.{log,info,warn,error}`, `window.onerror`, and
 * unhandled promise rejections, batches them, and POSTs to the same-origin
 * `/api/logs` endpoint. The browser never talks to VictoriaLogs directly — the
 * server forwards — so there is no CORS and VictoriaLogs stays localhost-only.
 *
 * Constraints mirror the backend sink: fire-and-forget, never throw into the
 * app, opt-in-safe (a missing/erroring endpoint is silently ignored).
 *
 * `formatClientLog` is exported pure for unit tests.
 */

export type ClientLogLevel = "debug" | "info" | "warn" | "error"

export interface ClientLogRecord {
  level: ClientLogLevel
  msg: string
  ts: string
  url: string
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(" ")
}

/** Build one client log record. Pure. */
export function formatClientLog(
  level: ClientLogLevel,
  args: unknown[],
  now: Date = new Date(),
  href = typeof location !== "undefined" ? location.href : "",
): ClientLogRecord {
  return { level, msg: stringifyArgs(args), ts: now.toISOString(), url: href }
}

const MAX_BUFFER = 1000
const FLUSH_INTERVAL_MS = 3000

let installed = false

/**
 * Install the client log shipper. Idempotent. Returns an uninstall function.
 * Safe to call unconditionally from the client entry point.
 */
export function installClientLogShipper(endpoint = "/api/logs"): () => void {
  if (installed || typeof window === "undefined") return () => {}
  installed = true

  let buffer: ClientLogRecord[] = []

  function enqueue(rec: ClientLogRecord) {
    if (buffer.length >= MAX_BUFFER) buffer.shift() // drop oldest, never grow unbounded
    buffer.push(rec)
  }

  function flush(useBeacon = false) {
    if (buffer.length === 0) return
    const batch = buffer
    buffer = []
    const body = JSON.stringify({ logs: batch })
    try {
      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }))
        return
      }
      void fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // never throw from logging
    }
  }

  const levels: Array<[keyof Console, ClientLogLevel]> = [
    ["debug", "debug"],
    ["info", "info"],
    ["log", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ]
  const originals = new Map<keyof Console, (...a: unknown[]) => void>()
  for (const [method, level] of levels) {
    const original = console[method] as (...a: unknown[]) => void
    originals.set(method, original)
    ;(console[method] as unknown) = (...args: unknown[]) => {
      try {
        enqueue(formatClientLog(level, args))
      } catch {
        /* ignore */
      }
      original(...args)
    }
  }

  const onError = (e: ErrorEvent) =>
    enqueue(formatClientLog("error", [`window.onerror: ${e.message}`, e.error]))
  const onRejection = (e: PromiseRejectionEvent) =>
    enqueue(formatClientLog("error", ["unhandledrejection:", e.reason]))
  const onHide = () => flush(true)

  window.addEventListener("error", onError)
  window.addEventListener("unhandledrejection", onRejection)
  window.addEventListener("pagehide", onHide)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true)
  })

  const timer = window.setInterval(() => flush(false), FLUSH_INTERVAL_MS)

  return () => {
    window.clearInterval(timer)
    for (const [method, original] of originals) {
      ;(console[method] as unknown) = original
    }
    window.removeEventListener("error", onError)
    window.removeEventListener("unhandledrejection", onRejection)
    window.removeEventListener("pagehide", onHide)
    installed = false
  }
}

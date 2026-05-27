/**
 * Backend log sink → VictoriaLogs (observability, decision 0012).
 *
 * Tees `console.*` output to VictoriaLogs' JSON-stream ingest API
 * (`POST /insert/jsonline`) in addition to normal stdout. Used by both the
 * server (`cli.ts`) and the runner (`runner.ts`) processes.
 *
 * Design constraints:
 * - **Never break the app.** All shipping is fire-and-forget; a down or slow
 *   VictoriaLogs must not throw into, block, or crash the host process.
 * - **Opt-in.** Disabled unless `VICTORIALOGS_URL` is set, so default runs are
 *   byte-identical to before.
 * - **No deps.** Plain `fetch` + a small in-memory batch.
 *
 * Pure helpers (`toLogLine`, `serializeBatch`) are exported for unit tests.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

/** One VictoriaLogs jsonline record. `_time`/`_msg` are VL's default time/msg fields. */
export interface LogLine {
  _time: string
  _msg: string
  level: LogLevel
  source: string
  component: string
  host: string
  pid: number
}

export interface LogSinkBase {
  source: string // "backend"
  component: string // "server" | "runner"
  host: string
  pid: number
}

/** Flatten console arguments into a single message string (no throwing on cycles). */
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

/** Build a single VL record from a console call. Pure. */
export function toLogLine(
  level: LogLevel,
  args: unknown[],
  base: LogSinkBase,
  now: Date = new Date(),
): LogLine {
  return {
    _time: now.toISOString(),
    _msg: stringifyArgs(args),
    level,
    source: base.source,
    component: base.component,
    host: base.host,
    pid: base.pid,
  }
}

/** Serialize a batch as newline-delimited JSON for `/insert/jsonline`. Pure. */
export function serializeBatch(lines: LogLine[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n")
}

export interface LogShipperOptions {
  url: string
  base: LogSinkBase
  flushIntervalMs?: number
  maxBatch?: number
  /** Injectable for tests. */
  fetchFn?: typeof fetch
}

export interface LogShipper {
  add(line: LogLine): void
  flush(): Promise<void>
  stop(): void
}

/**
 * Batching shipper. Buffers records and POSTs them to VictoriaLogs on an
 * interval or when the buffer is full. All network errors are swallowed.
 */
export function createLogShipper(opts: LogShipperOptions): LogShipper {
  const flushIntervalMs = opts.flushIntervalMs ?? 2000
  const maxBatch = opts.maxBatch ?? 500
  const doFetch = opts.fetchFn ?? fetch
  const endpoint = `${opts.url.replace(/\/$/, "")}/insert/jsonline?_stream_fields=source,component`

  let buffer: LogLine[] = []
  let timer: ReturnType<typeof setInterval> | null = null

  async function flush(): Promise<void> {
    if (buffer.length === 0) return
    const batch = buffer
    buffer = []
    try {
      await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-ndjson" },
        body: serializeBatch(batch),
      })
    } catch {
      // Drop on failure — observability must never back-pressure the app.
    }
  }

  function add(line: LogLine): void {
    buffer.push(line)
    if (buffer.length >= maxBatch) void flush()
  }

  timer = setInterval(() => void flush(), flushIntervalMs)
  // Don't keep the event loop alive just for log flushing.
  if (typeof timer === "object" && timer && "unref" in timer) {
    ;(timer as { unref: () => void }).unref()
  }

  return {
    add,
    flush,
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}

/**
 * Tee `console.{debug,info,warn,error,log}` to VictoriaLogs while preserving the
 * original stdout behavior. No-op (returns a no-op uninstaller) when
 * `VICTORIALOGS_URL` is not set. Returns an uninstall function.
 */
export function installConsoleTee(env: NodeJS.ProcessEnv, component: string): () => void {
  const url = env.VICTORIALOGS_URL?.trim()
  if (!url) return () => {}

  const base: LogSinkBase = {
    source: "backend",
    component,
    host: env.HOSTNAME || "unknown",
    pid: typeof process !== "undefined" ? process.pid : 0,
  }
  const shipper = createLogShipper({ url, base })

  const levels: Array<[keyof Console, LogLevel]> = [
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
        shipper.add(toLogLine(level, args, base))
      } catch {
        // never let logging shipping break a console call
      }
      original(...args)
    }
  }

  return () => {
    for (const [method, original] of originals) {
      ;(console[method] as unknown) = original
    }
    shipper.stop()
  }
}

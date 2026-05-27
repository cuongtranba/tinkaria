import { describe, test, expect } from "bun:test"
import {
  toLogLine,
  serializeBatch,
  createLogShipper,
  installConsoleTee,
  type LogLine,
  type LogSinkBase,
} from "./log-sink"

const base: LogSinkBase = { source: "backend", component: "server", host: "h", pid: 42 }

describe("toLogLine", () => {
  test("joins string args into _msg and stamps fields", () => {
    const at = new Date("2026-05-27T10:00:00.000Z")
    const line = toLogLine("warn", ["[tinkaria]", "boom", 7], base, at)
    expect(line).toEqual({
      _time: "2026-05-27T10:00:00.000Z",
      _msg: "[tinkaria] boom 7",
      level: "warn",
      source: "backend",
      component: "server",
      host: "h",
      pid: 42,
    })
  })

  test("serializes Error args to stack/message, objects to JSON", () => {
    const line = toLogLine("error", [new Error("nope"), { a: 1 }], base)
    expect(line._msg).toContain("nope")
    expect(line._msg).toContain('{"a":1}')
  })

  test("does not throw on circular objects", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const line = toLogLine("info", [circular], base)
    expect(typeof line._msg).toBe("string")
  })
})

describe("serializeBatch", () => {
  test("produces newline-delimited JSON", () => {
    const lines: LogLine[] = [
      toLogLine("info", ["a"], base, new Date("2026-05-27T10:00:00Z")),
      toLogLine("info", ["b"], base, new Date("2026-05-27T10:00:01Z")),
    ]
    const out = serializeBatch(lines)
    expect(out.split("\n")).toHaveLength(2)
    expect(JSON.parse(out.split("\n")[0])._msg).toBe("a")
  })
})

describe("createLogShipper", () => {
  test("POSTs ndjson to /insert/jsonline with stream fields, and swallows fetch errors", async () => {
    const calls: { url: string; body: string }[] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    const shipper = createLogShipper({ url: "http://127.0.0.1:9428/", base, fetchFn })
    shipper.add(toLogLine("info", ["one"], base))
    shipper.add(toLogLine("info", ["two"], base))
    await shipper.flush()
    shipper.stop()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("http://127.0.0.1:9428/insert/jsonline?_stream_fields=source,component")
    expect(calls[0].body.split("\n")).toHaveLength(2)
  })

  test("flush with empty buffer makes no request", async () => {
    let n = 0
    const fetchFn = (async () => { n++; return new Response(null) }) as unknown as typeof fetch
    const shipper = createLogShipper({ url: "http://x", base, fetchFn })
    await shipper.flush()
    shipper.stop()
    expect(n).toBe(0)
  })

  test("fetch rejection is swallowed (no throw)", async () => {
    const fetchFn = (async () => { throw new Error("network down") }) as unknown as typeof fetch
    const shipper = createLogShipper({ url: "http://x", base, fetchFn })
    shipper.add(toLogLine("error", ["x"], base))
    await expect(shipper.flush()).resolves.toBeUndefined()
    shipper.stop()
  })
})

describe("installConsoleTee", () => {
  test("no-op when VICTORIALOGS_URL unset (console unchanged)", () => {
    const before = console.warn
    const uninstall = installConsoleTee({} as NodeJS.ProcessEnv, "server")
    expect(console.warn).toBe(before)
    uninstall()
  })

  test("when set, tees but still calls the original console method", () => {
    const seen: unknown[][] = []
    const origWarn = console.warn
    console.warn = ((...a: unknown[]) => seen.push(a)) as typeof console.warn
    const uninstall = installConsoleTee(
      { VICTORIALOGS_URL: "http://127.0.0.1:9428" } as unknown as NodeJS.ProcessEnv,
      "server",
    )
    console.warn("hello", 1)
    expect(seen).toEqual([["hello", 1]]) // original still invoked
    uninstall()
    console.warn = origWarn
  })
})

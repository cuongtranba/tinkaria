import { describe, test, expect } from "bun:test"
import { sanitizeClientLogs, buildNdjson, forwardClientLogs } from "./client-log-forwarder"

describe("sanitizeClientLogs", () => {
  test("keeps valid records and tags source/component", () => {
    const out = sanitizeClientLogs({
      logs: [{ level: "warn", msg: "hi", ts: "2026-05-27T10:00:00.000Z", url: "https://a/b" }],
    })
    expect(out).toEqual([
      { _time: "2026-05-27T10:00:00.000Z", _msg: "hi", level: "warn", source: "frontend", component: "browser", url: "https://a/b" },
    ])
  })

  test("drops entries with no message; defaults bad level to info; backfills bad ts", () => {
    const now = new Date("2026-05-27T12:00:00.000Z")
    const out = sanitizeClientLogs({ logs: [{ msg: "x", level: "nope", ts: "garbage" }, { level: "error" }] }, now)
    expect(out).toHaveLength(1)
    expect(out[0].level).toBe("info")
    expect(out[0]._time).toBe("2026-05-27T12:00:00.000Z")
  })

  test("non-array / non-object bodies → empty", () => {
    expect(sanitizeClientLogs(null)).toEqual([])
    expect(sanitizeClientLogs({ logs: "x" })).toEqual([])
    expect(sanitizeClientLogs({})).toEqual([])
  })

  test("caps record count and truncates long messages", () => {
    const logs = Array.from({ length: 1500 }, () => ({ msg: "a".repeat(20000) }))
    const out = sanitizeClientLogs({ logs })
    expect(out.length).toBe(1000)
    expect(out[0]._msg.length).toBe(8192)
  })
})

describe("buildNdjson", () => {
  test("newline-joins one JSON object per record", () => {
    const recs = sanitizeClientLogs({ logs: [{ msg: "a" }, { msg: "b" }] })
    const out = buildNdjson(recs)
    expect(out.split("\n")).toHaveLength(2)
    expect(JSON.parse(out.split("\n")[1])._msg).toBe("b")
  })
})

describe("forwardClientLogs", () => {
  test("ships ndjson to VL when VICTORIALOGS_URL set", async () => {
    const calls: { url: string; body: string }[] = []
    const fetchFn = (async (u: string, init?: RequestInit) => {
      calls.push({ url: u, body: String(init?.body) }); return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const n = await forwardClientLogs(
      { logs: [{ msg: "one", level: "info" }] },
      { VICTORIALOGS_URL: "http://127.0.0.1:9428" } as unknown as NodeJS.ProcessEnv,
      fetchFn,
    )
    expect(n).toBe(1)
    expect(calls[0].url).toBe("http://127.0.0.1:9428/insert/jsonline?_stream_fields=source,component")
  })

  test("no VL url → counts but does not ship", async () => {
    let shipped = 0
    const fetchFn = (async () => { shipped++; return new Response(null) }) as unknown as typeof fetch
    const n = await forwardClientLogs({ logs: [{ msg: "x" }] }, {} as NodeJS.ProcessEnv, fetchFn)
    expect(n).toBe(1)
    expect(shipped).toBe(0)
  })

  test("fetch failure is swallowed", async () => {
    const fetchFn = (async () => { throw new Error("down") }) as unknown as typeof fetch
    await expect(
      forwardClientLogs({ logs: [{ msg: "x" }] }, { VICTORIALOGS_URL: "http://x" } as unknown as NodeJS.ProcessEnv, fetchFn),
    ).resolves.toBe(1)
  })
})

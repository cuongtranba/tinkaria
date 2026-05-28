import { describe, test, expect } from "bun:test"
import { formatClientLog } from "./log-shipper"

describe("formatClientLog", () => {
  test("stamps level, msg, ts, url", () => {
    const at = new Date("2026-05-27T10:00:00.000Z")
    const rec = formatClientLog("warn", ["render failed", 3], at, "https://app/x")
    expect(rec).toEqual({
      level: "warn",
      msg: "render failed 3",
      ts: "2026-05-27T10:00:00.000Z",
      url: "https://app/x",
    })
  })

  test("flattens Error to stack/message", () => {
    const rec = formatClientLog("error", [new Error("kaboom")], new Date(), "")
    expect(rec.msg).toContain("kaboom")
  })

  test("survives circular objects", () => {
    const c: Record<string, unknown> = {}
    c.self = c
    const rec = formatClientLog("info", [c], new Date(), "")
    expect(typeof rec.msg).toBe("string")
  })
})

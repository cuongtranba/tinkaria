import { describe, test, expect } from "bun:test"
import { requiresCalloutForBind } from "./nats-bind-guard"

describe("requiresCalloutForBind", () => {
  // ── Allowed combinations ────────────────────────────────────────────────────

  test("loopback 127.0.0.1 + token → ok (dev default)", () => {
    expect(requiresCalloutForBind("127.0.0.1", "token")).toEqual({ ok: true })
  })

  test("loopback localhost + token → ok", () => {
    expect(requiresCalloutForBind("localhost", "token")).toEqual({ ok: true })
  })

  test("loopback ::1 + token → ok", () => {
    expect(requiresCalloutForBind("::1", "token")).toEqual({ ok: true })
  })

  test("loopback 127.0.0.1 + callout → ok", () => {
    expect(requiresCalloutForBind("127.0.0.1", "callout")).toEqual({ ok: true })
  })

  test("wide 0.0.0.0 + callout → ok (tailnet path)", () => {
    expect(requiresCalloutForBind("0.0.0.0", "callout")).toEqual({ ok: true })
  })

  test("tailnet IP + callout → ok", () => {
    expect(requiresCalloutForBind("100.64.1.1", "callout")).toEqual({ ok: true })
  })

  // ── Disallowed combinations ─────────────────────────────────────────────────

  test("wide 0.0.0.0 + token → refused with reason", () => {
    const result = requiresCalloutForBind("0.0.0.0", "token")
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Refusing to bind NATS to 0\.0\.0\.0 in token mode/)
    expect(result.reason).toMatch(/NATS_AUTH_MODE=callout/)
  })

  test("tailnet IP + token → refused with reason", () => {
    const result = requiresCalloutForBind("100.64.1.1", "token")
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Refusing to bind NATS to 100\.64\.1\.1 in token mode/)
  })

  test("arbitrary private IP + token → refused", () => {
    const result = requiresCalloutForBind("192.168.1.10", "token")
    expect(result.ok).toBe(false)
  })

  test("reason message is non-empty when refused", () => {
    const result = requiresCalloutForBind("10.0.0.1", "token")
    expect(result.ok).toBe(false)
    expect(typeof result.reason).toBe("string")
    expect((result.reason ?? "").length).toBeGreaterThan(0)
  })

  // ── Case-insensitive loopback match ─────────────────────────────────────────

  test("LOCALHOST (uppercase) + token → ok (case-insensitive loopback)", () => {
    expect(requiresCalloutForBind("LOCALHOST", "token")).toEqual({ ok: true })
  })

  test("Localhost (mixed-case) + token → ok", () => {
    expect(requiresCalloutForBind("Localhost", "token")).toEqual({ ok: true })
  })

  test("  localhost  (whitespace) + token → ok", () => {
    expect(requiresCalloutForBind("  localhost  ", "token")).toEqual({ ok: true })
  })
})

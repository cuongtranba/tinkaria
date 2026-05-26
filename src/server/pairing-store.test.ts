/**
 * Unit tests for PairingStore (PR2 Stage 1).
 *
 * Uses injectable clock and RNG so tests are deterministic and fast.
 */

import { describe, test, expect } from "bun:test"
import { PairingStore } from "./pairing-store"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry() {
  return { runnerId: "runner-test-1", token: "tok.sig" }
}

/** A store with a controllable clock (ms) and a fixed-byte RNG. */
function makeStore(startMs = 1_000_000, rngByte = 0xab) {
  let now = startMs
  const tick = (ms: number) => { now += ms }
  const store = new PairingStore({
    now: () => now,
    randomBytes: (n) => new Uint8Array(n).fill(rngByte),
    ttlMs: 60_000, // 1 min for tests
  })
  return { store, tick }
}

/** A store with a controllable clock and a counter-based RNG (unique codes per issue). */
function makeCounterStore(startMs = 1_000_000) {
  let now = startMs
  let counter = 0
  const tick = (ms: number) => { now += ms }
  const store = new PairingStore({
    now: () => now,
    randomBytes: (n) => {
      const buf = new Uint8Array(n)
      // Fill with an incrementing byte so each call produces a distinct value.
      buf.fill(counter++ & 0xff)
      return buf
    },
    ttlMs: 60_000,
  })
  return { store, tick }
}

// ── Code shape ────────────────────────────────────────────────────────────────

describe("PairingStore.issue", () => {
  test("returns a code and expiresAt", () => {
    const startMs = 1_000_000
    const { store } = makeStore(startMs)
    const { code, expiresAt } = store.issue(makeEntry())
    expect(typeof code).toBe("string")
    expect(code.length).toBeGreaterThan(0)
    // expiresAt should be in the future relative to our injected clock start
    expect(expiresAt).toBeGreaterThan(startMs)
  })

  test("code has dashed base32 shape (xxxxx-xxxxx-xxxxxx)", () => {
    const { store } = makeStore()
    const { code } = store.issue(makeEntry())
    // 5-5-6 groups separated by dashes (16 base32 chars), lowercase a-z and 2-7
    expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}-[a-z2-7]{6}$/)
  })

  test("codes from different RNG bytes are unique", () => {
    // Two stores with different RNG seeds produce different codes.
    const { store: s1 } = makeStore(1_000_000, 0x11)
    const { store: s2 } = makeStore(1_000_000, 0x22)
    const { code: c1 } = s1.issue(makeEntry())
    const { code: c2 } = s2.issue(makeEntry())
    expect(c1).not.toBe(c2)
  })

  test("expiresAt equals now + ttlMs", () => {
    const startMs = 5_000_000
    const { store } = makeStore(startMs)
    const { expiresAt } = store.issue(makeEntry())
    expect(expiresAt).toBe(startMs + 60_000)
  })
})

// ── Exchange — happy path ─────────────────────────────────────────────────────

describe("PairingStore.exchange", () => {
  test("exchange returns runnerId and token on first use", () => {
    const { store } = makeStore()
    const entry = makeEntry()
    const { code } = store.issue(entry)
    const result = store.exchange(code)
    expect(result).toEqual({ ok: true, runnerId: entry.runnerId, token: entry.token })
  })

  test("second exchange of same code returns consumed", () => {
    const { store } = makeStore()
    const { code } = store.issue(makeEntry())
    store.exchange(code) // first — succeeds
    const result = store.exchange(code) // second
    expect(result).toEqual({ ok: false, error: "consumed" })
  })

  // ── Expiry ────────────────────────────────────────────────────────────────

  test("expired code (clock advanced past expiresAt) returns expired", () => {
    const { store, tick } = makeStore()
    const { code } = store.issue(makeEntry())
    tick(60_001) // just past the 1-min TTL
    const result = store.exchange(code)
    expect(result).toEqual({ ok: false, error: "expired" })
  })

  test("code exactly at expiresAt boundary is expired (>= check)", () => {
    const { store, tick } = makeStore()
    const { code, expiresAt } = store.issue(makeEntry())
    // Advance so now === expiresAt exactly.
    tick(expiresAt - 1_000_000) // start was 1_000_000
    const result = store.exchange(code)
    expect(result).toEqual({ ok: false, error: "expired" })
  })

  test("unknown code returns unknown", () => {
    const { store } = makeStore()
    const result = store.exchange("xxxxx-yyyyy-zzzz")
    expect(result).toEqual({ ok: false, error: "unknown" })
  })

  // ── Sweep ─────────────────────────────────────────────────────────────────

  test("expired entries are swept from internal map on next issue", () => {
    // After an issue() triggers a sweep, previously-expired entries are deleted.
    // A subsequent exchange() of the old code returns "unknown" (entry gone).
    const { store, tick } = makeCounterStore()
    const { code } = store.issue(makeEntry())
    tick(60_001) // expire it
    // Second issue produces a different code (counter RNG) and triggers sweep.
    store.issue({ runnerId: "runner-2", token: "tok2.sig" })
    // First entry was swept — exchange now reports "unknown".
    const result = store.exchange(code)
    expect(result).toEqual({ ok: false, error: "unknown" })
  })
})

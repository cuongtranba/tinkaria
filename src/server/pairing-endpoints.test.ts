/**
 * Integration tests for the pairing endpoints (PR2 Stage 1).
 *
 * Starts a real embedded NATS server on a dedicated port and exercises
 * POST /api/pairing/code and POST /api/pairing/exchange over HTTP.
 *
 * Covers:
 *  - code → exchange round-trip; returned token verifies via verifyCredentialToken.
 *  - second exchange of same code → 410 (consumed).
 *  - unknown code → 400.
 *  - token mode (no callout tokenSecret) → 409 on code issue.
 */

import { afterEach, describe, test, expect } from "bun:test"
import { startServer } from "./server"
import { verifyCredentialToken } from "../nats/auth-callout/token"
import { ensureCalloutKeys } from "../nats/auth-callout/keys"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"

type StartedServer = Awaited<ReturnType<typeof startServer>>

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(port: number, pathname: string, body?: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Callout-mode suite ────────────────────────────────────────────────────────

describe("pairing endpoints (callout mode)", () => {
  let started: StartedServer | null = null
  let natsDataDir: string

  afterEach(async () => {
    await started?.stop()
    started = null
  })

  test("code → exchange round-trip; token verifies as runner credential", async () => {
    natsDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr2-pair-test-"))
    process.env.NATS_AUTH_MODE = "callout"
    process.env.NATS_DATA_DIR = natsDataDir
    started = await startServer({ port: 4381, host: "127.0.0.1", strictPort: true })
    const port = started.port

    // Issue a pairing code.
    const issueRes = await post(port, "/api/pairing/code")
    expect(issueRes.status).toBe(200)
    const issued = await issueRes.json() as { code: string; expiresAt: number }
    expect(typeof issued.code).toBe("string")
    expect(issued.code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}-[a-z2-7]{6}$/)
    expect(typeof issued.expiresAt).toBe("number")
    expect(issued.expiresAt).toBeGreaterThan(Date.now())

    // Exchange the code.
    const exchangeRes = await post(port, "/api/pairing/exchange", { code: issued.code })
    expect(exchangeRes.status).toBe(200)
    const exchanged = await exchangeRes.json() as {
      runnerId: string; token: string; natsUrl: string; natsWsUrl: string
    }
    expect(typeof exchanged.runnerId).toBe("string")
    expect(exchanged.runnerId).toMatch(/^runner-/)
    expect(typeof exchanged.token).toBe("string")
    expect(typeof exchanged.natsUrl).toBe("string")
    expect(typeof exchanged.natsWsUrl).toBe("string")

    // Verify the returned token decodes to the correct runner identity.
    const keys = await ensureCalloutKeys(natsDataDir)
    const identity = await verifyCredentialToken(exchanged.token, keys.tokenSecret)
    expect(identity).toEqual({ class: "runner", runnerId: exchanged.runnerId })
  }, 30_000)

  test("second exchange of same code returns 410 (consumed)", async () => {
    natsDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr2-pair-test-"))
    process.env.NATS_AUTH_MODE = "callout"
    process.env.NATS_DATA_DIR = natsDataDir
    started = await startServer({ port: 4382, host: "127.0.0.1", strictPort: true })
    const port = started.port

    const { code } = await post(port, "/api/pairing/code").then((r) => r.json()) as { code: string }
    // First exchange — succeeds.
    const first = await post(port, "/api/pairing/exchange", { code })
    expect(first.status).toBe(200)
    // Second exchange — consumed.
    const second = await post(port, "/api/pairing/exchange", { code })
    expect(second.status).toBe(410)
    const body = await second.json() as { error: string }
    expect(body.error).toBe("consumed")
  }, 30_000)

  test("unknown code returns 400", async () => {
    natsDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr2-pair-test-"))
    process.env.NATS_AUTH_MODE = "callout"
    process.env.NATS_DATA_DIR = natsDataDir
    started = await startServer({ port: 4383, host: "127.0.0.1", strictPort: true })
    const port = started.port

    const res = await post(port, "/api/pairing/exchange", { code: "aaaaa-bbbbb-cccccc" })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("unknown")
  }, 30_000)
})

// ── Token-mode suite ──────────────────────────────────────────────────────────

describe("pairing endpoints (token mode)", () => {
  let started: StartedServer | null = null

  afterEach(async () => {
    await started?.stop()
    started = null
    delete process.env.NATS_AUTH_MODE
    delete process.env.NATS_DATA_DIR
  })

  test("POST /api/pairing/code returns 409 in token mode", async () => {
    process.env.NATS_AUTH_MODE = "token"
    delete process.env.NATS_DATA_DIR
    started = await startServer({ port: 4384, host: "127.0.0.1", strictPort: true })
    const port = started.port

    const res = await post(port, "/api/pairing/code")
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toContain("callout")
  }, 30_000)
})

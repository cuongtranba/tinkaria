/**
 * Unit tests for stateless credential tokens (token.ts).
 *
 * Covers:
 *  - Basic mint + verify round-trip.
 *  - byteOffset bug regression: verify a token minted when the secret is a
 *    sub-array view (non-zero byteOffset) so WebCrypto uses the exact bytes.
 *  - exp (expiry): valid token accepted, expired token rejected,
 *    tampered exp rejected (exp is inside the HMAC'd payload).
 *  - Tokens without exp are rejected (no-legacy-format regression).
 *  - Malformed / missing tokens rejected.
 */

import { describe, test, expect } from "bun:test"
import { mintCredentialToken, verifyCredentialToken } from "./token"

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshSecret(): Uint8Array {
  const s = new Uint8Array(32)
  crypto.getRandomValues(s)
  return s
}

/**
 * Return a Uint8Array backed by the same buffer as `parent` but with a
 * non-zero byteOffset so `.buffer` spans more than just the 32 bytes we care
 * about. This reproduces the pooled-Buffer scenario (Buffer.from pools memory).
 */
function subArrayView(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(64)
  padded.set(data, 16) // byteOffset=16 for the view we return
  return padded.subarray(16, 48)
}

// ── Round-trip ────────────────────────────────────────────────────────────────

describe("mintCredentialToken / verifyCredentialToken", () => {
  test("server-admin token round-trips", async () => {
    const secret = freshSecret()
    const token = await mintCredentialToken({ class: "server-admin" }, secret)
    const identity = await verifyCredentialToken(token, secret)
    expect(identity).toEqual({ class: "server-admin" })
  })

  test("ui-client token round-trips", async () => {
    const secret = freshSecret()
    const token = await mintCredentialToken({ class: "ui-client" }, secret)
    const identity = await verifyCredentialToken(token, secret)
    expect(identity).toEqual({ class: "ui-client" })
  })

  test("runner token round-trips with runnerId", async () => {
    const secret = freshSecret()
    const token = await mintCredentialToken({ class: "runner", runnerId: "r-42" }, secret)
    const identity = await verifyCredentialToken(token, secret)
    expect(identity).toEqual({ class: "runner", runnerId: "r-42" })
  })

  // ── byteOffset regression ───────────────────────────────────────────────────

  test("minting with a sub-array secret (non-zero byteOffset) still verifies", async () => {
    const rawSecret = freshSecret()
    // subArrayView has byteOffset=16; rawSecret and subView hold the same 32 bytes.
    const subView = subArrayView(rawSecret)
    expect(subView.byteOffset).toBe(16)

    // Mint with the sub-view; verify with the canonical flat copy — must succeed.
    const token = await mintCredentialToken({ class: "ui-client" }, subView)
    const flatSecret = rawSecret.slice() // byteOffset=0
    const identity = await verifyCredentialToken(token, flatSecret)
    expect(identity).toEqual({ class: "ui-client" })
  })

  test("verifying with a sub-array secret (non-zero byteOffset) succeeds", async () => {
    const rawSecret = freshSecret()
    const subView = subArrayView(rawSecret)
    expect(subView.byteOffset).toBe(16)

    // Mint with the canonical flat copy; verify with the sub-view.
    const token = await mintCredentialToken({ class: "server-admin" }, rawSecret.slice())
    const identity = await verifyCredentialToken(token, subView)
    expect(identity).toEqual({ class: "server-admin" })
  })

  // ── exp (expiry) ────────────────────────────────────────────────────────────

  test("token with a future exp is accepted", async () => {
    const secret = freshSecret()
    // Default TTL is 30 days; token should be valid right now.
    const token = await mintCredentialToken({ class: "ui-client" }, secret)
    expect(await verifyCredentialToken(token, secret)).toEqual({ class: "ui-client" })
  })

  test("token with an already-expired exp is rejected", async () => {
    const secret = freshSecret()
    // Pass ttlSeconds=-1 so exp = iat - 1 (already in the past).
    const token = await mintCredentialToken({ class: "ui-client" }, secret, -1)
    expect(await verifyCredentialToken(token, secret)).toBeNull()
  })

  test("token with tampered exp is rejected (exp is inside HMAC'd payload)", async () => {
    const secret = freshSecret()
    // Mint a valid token, then decode and modify exp in the payload.
    const token = await mintCredentialToken({ class: "ui-client" }, secret)
    const [payloadB64, sigB64] = token.split(".")
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString())
    // Extend the exp far into the future by tampering.
    payload.exp = Math.floor(Date.now() / 1000) + 999999
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const tamperedToken = `${tamperedPayloadB64}.${sigB64}`
    // HMAC no longer matches the new payload → must be rejected.
    expect(await verifyCredentialToken(tamperedToken, secret)).toBeNull()
  })

  test("token without exp field is rejected (no legacy format)", async () => {
    const secret = freshSecret()
    // Craft a token manually without an exp field.
    const payloadObj = { c: "ui-client", iat: Math.floor(Date.now() / 1000) }
    const payloadJson = JSON.stringify(payloadObj)
    const payloadB64 = Buffer.from(payloadJson).toString("base64url")

    // Sign it legitimately so the HMAC is valid.
    const key = await crypto.subtle.importKey(
      "raw",
      secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const rawSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadJson))
    const sigB64 = Buffer.from(new Uint8Array(rawSig)).toString("base64url")
    const legacyToken = `${payloadB64}.${sigB64}`

    expect(await verifyCredentialToken(legacyToken, secret)).toBeNull()
  })

  // ── Wrong secret ────────────────────────────────────────────────────────────

  test("wrong secret returns null", async () => {
    const secret = freshSecret()
    const other = freshSecret()
    const token = await mintCredentialToken({ class: "server-admin" }, secret)
    expect(await verifyCredentialToken(token, other)).toBeNull()
  })

  // ── Malformed inputs ────────────────────────────────────────────────────────

  test("undefined token returns null", async () => {
    const secret = freshSecret()
    expect(await verifyCredentialToken(undefined, secret)).toBeNull()
  })

  test("token without dot separator returns null", async () => {
    const secret = freshSecret()
    expect(await verifyCredentialToken("nodothere", secret)).toBeNull()
  })

  test("garbage token returns null", async () => {
    const secret = freshSecret()
    expect(await verifyCredentialToken("!!!.???", secret)).toBeNull()
  })
})

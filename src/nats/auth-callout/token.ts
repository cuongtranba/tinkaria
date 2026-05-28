/**
 * Stateless signed credential tokens (Stage B, PR1).
 *
 * Bridges the server process (token issuance) and the daemon child process
 * (credential validation in the callout responder) without any shared
 * in-memory state. The two processes share only the 32-byte token secret
 * stored on disk (loaded by ensureCalloutKeys).
 *
 * Token format:
 *   base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, JSON payload))
 *
 * Payload shape:
 *   { c: ConnectionClass, r?: string, iat: number, exp: number }
 *   where r is runnerId (only for class "runner") and exp is expiry epoch seconds.
 *
 * Pure — no I/O, fully unit-testable.
 */

import type { ResolvedIdentity } from "./scope-policy"

/** Default TTL: 30 days in seconds (pilot-safe; per-class TTLs are PR2). */
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60 // 2592000

interface TokenPayload {
  /** Connection class. */
  c: "server-admin" | "ui-client" | "runner"
  /** Runner ID — only present for class "runner". */
  r?: string
  /** Issued-at epoch seconds. */
  iat: number
  /** Expiry epoch seconds (iat + ttl). Tokens without exp are rejected. */
  exp: number
}

function b64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"))
}

/** Return an ArrayBuffer view that covers exactly the bytes of the given Uint8Array.
 *  Uint8Array.prototype.buffer may be a pooled backing buffer with a non-zero
 *  byteOffset, which would cause WebCrypto to sign/verify the wrong bytes.
 *  We copy into a fresh ArrayBuffer so the type is unambiguously ArrayBuffer
 *  (not SharedArrayBuffer) and WebCrypto never sees stray pooled bytes. */
function exactBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
}

async function hmacSign(secret: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    exactBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

async function hmacVerify(secret: Uint8Array, data: string, sig: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    exactBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  return crypto.subtle.verify("HMAC", key, exactBuffer(sig), new TextEncoder().encode(data))
}

/**
 * Mint a credential token for the given identity.
 * The token is self-contained and verifiable with only the shared secret.
 *
 * @param ttlSeconds — lifetime in seconds (default: 30 days). Per-class TTLs
 *   and token refresh are deferred to PR2; this param exists so tests can use
 *   short TTLs without touching the default.
 */
export async function mintCredentialToken(
  identity: ResolvedIdentity,
  secret: Uint8Array,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const payload: TokenPayload = {
    c: identity.class,
    iat,
    exp: iat + ttlSeconds,
    ...(identity.class === "runner" ? { r: identity.runnerId } : {}),
  }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payloadJson))
  const sig = await hmacSign(secret, payloadJson)
  return `${payloadB64}.${b64urlEncode(sig)}`
}

/**
 * Verify a credential token and return the resolved identity.
 * Returns null if the token is missing, malformed, has an invalid signature,
 * or has expired. Tokens without an `exp` field are also rejected.
 */
export async function verifyCredentialToken(
  token: string | undefined,
  secret: Uint8Array
): Promise<ResolvedIdentity | null> {
  if (!token) return null

  const dotIdx = token.indexOf(".")
  if (dotIdx === -1) return null

  const payloadB64 = token.slice(0, dotIdx)
  const sigB64 = token.slice(dotIdx + 1)

  let payloadJson: string
  try {
    payloadJson = new TextDecoder().decode(b64urlDecode(payloadB64))
  } catch {
    return null
  }

  let sig: Uint8Array
  try {
    sig = b64urlDecode(sigB64)
  } catch {
    return null
  }

  const valid = await hmacVerify(secret, payloadJson, sig)
  if (!valid) return null

  let payload: TokenPayload
  try {
    payload = JSON.parse(payloadJson) as TokenPayload
  } catch {
    return null
  }

  // Reject tokens without exp (no persisted tokens exist; defensive against old format).
  if (typeof payload.exp !== "number") return null

  // Reject expired tokens.
  const now = Math.floor(Date.now() / 1000)
  if (now > payload.exp) return null

  if (payload.c === "runner") {
    if (!payload.r) return null
    return { class: "runner", runnerId: payload.r }
  }
  if (payload.c === "server-admin") return { class: "server-admin" }
  if (payload.c === "ui-client") return { class: "ui-client" }

  return null
}

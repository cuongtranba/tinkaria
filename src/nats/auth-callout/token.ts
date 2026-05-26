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
 *   { c: ConnectionClass, r?: string, iat: number }
 *   where r is runnerId (only for class "runner").
 *
 * Pure — no I/O, fully unit-testable.
 */

import type { ResolvedIdentity } from "./scope-policy"

interface TokenPayload {
  /** Connection class. */
  c: "server-admin" | "ui-client" | "runner"
  /** Runner ID — only present for class "runner". */
  r?: string
  /** Issued-at epoch seconds. */
  iat: number
}

function b64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"))
}

async function hmacSign(secret: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret.buffer as ArrayBuffer,
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
    secret.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  return crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, new TextEncoder().encode(data))
}

/**
 * Mint a credential token for the given identity.
 * The token is self-contained and verifiable with only the shared secret.
 */
export async function mintCredentialToken(
  identity: ResolvedIdentity,
  secret: Uint8Array
): Promise<string> {
  const payload: TokenPayload = {
    c: identity.class,
    iat: Math.floor(Date.now() / 1000),
    ...(identity.class === "runner" ? { r: identity.runnerId } : {}),
  }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payloadJson))
  const sig = await hmacSign(secret, payloadJson)
  return `${payloadB64}.${b64urlEncode(sig)}`
}

/**
 * Verify a credential token and return the resolved identity.
 * Returns null if the token is missing, malformed, or has an invalid signature.
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

  if (payload.c === "runner") {
    if (!payload.r) return null
    return { class: "runner", runnerId: payload.r }
  }
  if (payload.c === "server-admin") return { class: "server-admin" }
  if (payload.c === "ui-client") return { class: "ui-client" }

  return null
}

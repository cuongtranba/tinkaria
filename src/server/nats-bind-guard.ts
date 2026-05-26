/**
 * Guard: a wide (non-loopback) NATS bind is only permitted in callout mode.
 *
 * Decision 0007: never expose a shared-token bus on the tailnet.
 * Loopback + token stays allowed (dev default).
 * Non-loopback + callout is allowed (tailnet path); logs a note.
 * Non-loopback + token is refused at startup with a fatal error message.
 */

/** The set of host values that are considered loopback/local-only. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])

export type AuthMode = "callout" | "token"

export interface BindGuardResult {
  ok: boolean
  /** Present only when ok is false. */
  reason?: string
}

/**
 * Pure predicate — no side effects.
 *
 * Returns `{ ok: false, reason }` when binding a non-loopback host in token
 * mode (decision 0007), `{ ok: true }` otherwise.
 */
export function requiresCalloutForBind(
  host: string,
  authMode: AuthMode,
): BindGuardResult {
  const isLoopback = LOOPBACK_HOSTS.has(host)
  if (!isLoopback && authMode !== "callout") {
    return {
      ok: false,
      reason:
        `Refusing to bind NATS to ${host} in token mode — ` +
        `a shared-token bus must not be exposed beyond loopback; ` +
        `set NATS_AUTH_MODE=callout`,
    }
  }
  return { ok: true }
}

/**
 * In-memory single-use pairing code store (PR2 Stage 1).
 *
 * Issues short-lived, unguessable codes that each map once to a pre-minted
 * runner credential. Codes are consumed atomically on first exchange; expired
 * or unknown codes are rejected. Lost on server restart (the 10-min TTL window
 * means the member can simply re-issue — EventStore persistence is deferred).
 *
 * Pure / injectable clock + RNG for unit tests.
 */

/** Default pairing code TTL: 10 minutes. */
export const DEFAULT_CODE_TTL_MS = 10 * 60 * 1000

/** Base32 alphabet (RFC 4648, lowercase, human-legible, no padding). */
const BASE32_CHARS = "abcdefghijklmnopqrstuvwxyz234567"

/** Number of random bytes per code — gives ~80 bits of entropy. */
const CODE_RANDOM_BYTES = 10

/** Format: xxxxx-xxxxx-xxxxxx (5-5-6, 16 base32 chars total, dashed for readability). */
function formatCode(raw: string): string {
  // 10 random bytes → 16 base32 chars; split 5-5-6 for human readability.
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10)}`
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += BASE32_CHARS[(value >>> bits) & 0x1f]
    }
  }
  return output
}

interface PairingEntry {
  runnerId: string
  /** Pre-minted durable runner credential token. Never logged in full. */
  token: string
  expiresAt: number
  consumed: boolean
}

export type ExchangeResult =
  | { ok: true; runnerId: string; token: string }
  | { ok: false; error: "expired" | "consumed" | "unknown" }

export interface PairingStoreOptions {
  /** Injected for tests; defaults to Date.now. */
  now?: () => number
  /** Injected for tests; defaults to crypto.getRandomValues. */
  randomBytes?: (n: number) => Uint8Array
  /** Code TTL in ms; defaults to DEFAULT_CODE_TTL_MS (10 min). */
  ttlMs?: number
}

export class PairingStore {
  private readonly codes = new Map<string, PairingEntry>()
  private readonly now: () => number
  private readonly randomBytes: (n: number) => Uint8Array
  private readonly ttlMs: number

  constructor(options: PairingStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.randomBytes = options.randomBytes ?? ((n) => {
      const buf = new Uint8Array(n)
      crypto.getRandomValues(buf)
      return buf
    })
    this.ttlMs = options.ttlMs ?? DEFAULT_CODE_TTL_MS
  }

  /**
   * Issue a new pairing code for the given runner credential.
   * Returns the code and the timestamp (ms) when it expires.
   */
  issue(params: { runnerId: string; token: string }): { code: string; expiresAt: number } {
    this.sweep()
    const raw = encodeBase32(this.randomBytes(CODE_RANDOM_BYTES))
    const code = formatCode(raw)
    const expiresAt = this.now() + this.ttlMs
    this.codes.set(code, { runnerId: params.runnerId, token: params.token, expiresAt, consumed: false })
    return { code, expiresAt }
  }

  /**
   * Exchange a code for its runner credential, atomically consuming it.
   * A second call with the same code returns { error: "consumed" }.
   * An expired code returns { error: "expired" }.
   * An unknown code returns { error: "unknown" }.
   */
  exchange(code: string): ExchangeResult {
    // Look up the entry BEFORE sweeping so we can distinguish "expired"
    // (we know the code, it just timed out) from "unknown" (never issued).
    const entry = this.codes.get(code)
    this.sweep()
    if (!entry) return { ok: false, error: "unknown" }
    if (entry.consumed) return { ok: false, error: "consumed" }
    if (this.now() >= entry.expiresAt) return { ok: false, error: "expired" }
    // Atomically mark consumed before returning.
    entry.consumed = true
    return { ok: true, runnerId: entry.runnerId, token: entry.token }
  }

  /** Remove expired (non-consumed) entries to prevent unbounded memory growth. */
  private sweep(): void {
    const now = this.now()
    for (const [code, entry] of this.codes) {
      if (!entry.consumed && now >= entry.expiresAt) this.codes.delete(code)
    }
  }
}

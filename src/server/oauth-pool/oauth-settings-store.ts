import { promises as fs } from "fs"
import path from "path"
import { homedir } from "os"
import {
  CLAUDE_AUTH_DEFAULTS,
  type ClaudeAuthSettings,
  type OAuthTokenEntry,
  type OAuthTokenStatus,
} from "../../shared/types"
import type { TokenStatusPatch } from "./oauth-token-pool"

const FILE_NAME = "oauth-tokens.json"

function defaultDir(): string {
  return path.join(homedir(), ".tinkaria")
}

function isValidStatus(value: unknown): value is OAuthTokenStatus {
  return value === "active" || value === "limited" || value === "error" || value === "disabled"
}

function normalizeEntry(raw: unknown): OAuthTokenEntry | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || typeof r.label !== "string" || typeof r.token !== "string") return null
  const status = isValidStatus(r.status) ? r.status : "active"
  const out: OAuthTokenEntry = {
    id: r.id,
    label: r.label,
    token: r.token,
    status,
    limitedUntil: typeof r.limitedUntil === "number" ? r.limitedUntil : null,
    lastUsedAt: typeof r.lastUsedAt === "number" ? r.lastUsedAt : null,
    lastErrorAt: typeof r.lastErrorAt === "number" ? r.lastErrorAt : null,
    lastErrorMessage: typeof r.lastErrorMessage === "string" ? r.lastErrorMessage : null,
    addedAt: typeof r.addedAt === "number" ? r.addedAt : Date.now(),
  }
  if (typeof r.maxConcurrent === "number" && Number.isFinite(r.maxConcurrent)) {
    out.maxConcurrent = r.maxConcurrent
  }
  return out
}

function normalizeSettings(raw: unknown): ClaudeAuthSettings {
  if (!raw || typeof raw !== "object") return { ...CLAUDE_AUTH_DEFAULTS, tokens: [] }
  const r = raw as Record<string, unknown>
  const tokensRaw = Array.isArray(r.tokens) ? r.tokens : []
  const tokens = tokensRaw.map(normalizeEntry).filter((t): t is OAuthTokenEntry => t !== null)
  const concurrencyDefault = typeof r.concurrencyDefault === "number" && Number.isFinite(r.concurrencyDefault)
    ? r.concurrencyDefault
    : CLAUDE_AUTH_DEFAULTS.concurrencyDefault
  return { tokens, concurrencyDefault }
}

export class OAuthSettingsStore {
  private readonly filePath: string
  private cached: ClaudeAuthSettings = { ...CLAUDE_AUTH_DEFAULTS, tokens: [] }
  private writeChain: Promise<void> = Promise.resolve()
  private loaded = false

  constructor(dataDir = defaultDir()) {
    this.filePath = path.join(dataDir, FILE_NAME)
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw)
      this.cached = normalizeSettings(parsed)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== "ENOENT") {
        console.warn("[oauth-pool] failed to load tokens:", e.message)
      }
      this.cached = { ...CLAUDE_AUTH_DEFAULTS, tokens: [] }
    }
    this.loaded = true
  }

  getSnapshot(): ClaudeAuthSettings {
    return { tokens: [...this.cached.tokens], concurrencyDefault: this.cached.concurrencyDefault }
  }

  getTokens(): OAuthTokenEntry[] {
    return [...this.cached.tokens]
  }

  getConcurrencyDefault(): number {
    return this.cached.concurrencyDefault
  }

  async addToken(input: { label: string; token: string; maxConcurrent?: number }): Promise<OAuthTokenEntry> {
    if (!this.loaded) await this.load()
    const entry: OAuthTokenEntry = {
      id: cryptoRandomId(),
      label: input.label.trim(),
      token: input.token,
      status: "active",
      limitedUntil: null,
      lastUsedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      addedAt: Date.now(),
    }
    if (typeof input.maxConcurrent === "number") entry.maxConcurrent = input.maxConcurrent
    this.cached = { ...this.cached, tokens: [...this.cached.tokens, entry] }
    await this.persist()
    return entry
  }

  async removeToken(id: string): Promise<boolean> {
    if (!this.loaded) await this.load()
    const next = this.cached.tokens.filter((t) => t.id !== id)
    if (next.length === this.cached.tokens.length) return false
    this.cached = { ...this.cached, tokens: next }
    await this.persist()
    return true
  }

  async updateToken(id: string, patch: { label?: string; maxConcurrent?: number | null }): Promise<OAuthTokenEntry | null> {
    if (!this.loaded) await this.load()
    let updated: OAuthTokenEntry | null = null
    const next = this.cached.tokens.map((t) => {
      if (t.id !== id) return t
      const merged: OAuthTokenEntry = { ...t }
      if (typeof patch.label === "string") merged.label = patch.label.trim()
      if (patch.maxConcurrent === null) delete merged.maxConcurrent
      else if (typeof patch.maxConcurrent === "number") merged.maxConcurrent = patch.maxConcurrent
      updated = merged
      return merged
    })
    if (!updated) return null
    this.cached = { ...this.cached, tokens: next }
    await this.persist()
    return updated
  }

  async setConcurrencyDefault(value: number): Promise<void> {
    if (!this.loaded) await this.load()
    this.cached = { ...this.cached, concurrencyDefault: value }
    await this.persist()
  }

  /** Used by OAuthTokenPool writeStatus callback. Persists asynchronously. */
  mutateTokenStatus(id: string, patch: TokenStatusPatch): void {
    const next = this.cached.tokens.map((t) => {
      if (t.id !== id) return t
      return { ...t, ...patch }
    })
    this.cached = { ...this.cached, tokens: next }
    this.writeChain = this.writeChain.then(() => this.writeFile()).catch((err) => {
      console.warn("[oauth-pool] status write failed:", err instanceof Error ? err.message : String(err))
    })
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.writeFile())
    await this.writeChain
  }

  private async writeFile(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.cached, null, 2), "utf8")
    await fs.rename(tmp, this.filePath)
  }
}

function cryptoRandomId(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

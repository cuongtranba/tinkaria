/**
 * OAuth pool NATS responders.
 *
 * Subjects (request/reply under `runtime.cmd.oauth.*`):
 *   - oauth.list                         -> { ok, settings }
 *   - oauth.add { label, token, maxConcurrent? }  -> { ok, entry }
 *   - oauth.remove { id }                -> { ok, removed }
 *   - oauth.update { id, label?, maxConcurrent? } -> { ok, entry }
 *   - oauth.setConcurrencyDefault { value } -> { ok }
 *
 * Change broadcast: `runtime.evt.oauth.changed` carries snapshot after
 * mutations so clients can refresh without re-requesting.
 *
 * Token values are returned with full secret material — UI only renders
 * masked previews. Same posture as kanna; tinkaria runs on operator's own
 * machine.
 */

import type { NatsConnection, Subscription } from "@nats-io/transport-node"
import { compressPayload, decompressPayload } from "../../shared/compression"
import {
  ALL_OAUTH_COMMANDS,
  oauthChangedSubject,
} from "../../shared/nats-subjects"
import type { ClaudeAuthSettings, OAuthTokenEntry } from "../../shared/types"
import {
  OAUTH_TOKEN_LABEL_MAX,
  OAUTH_TOKEN_MAX_CONCURRENT_MAX,
  OAUTH_TOKEN_MAX_CONCURRENT_MIN,
  OAUTH_TOKEN_VALUE_MAX,
} from "../../shared/types"
import type { OAuthSettingsStore } from "./oauth-settings-store"

const LOG_PREFIX = "[oauth-pool]"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(data: unknown): Uint8Array {
  return compressPayload(encoder.encode(JSON.stringify(data)))
}

async function decode(data: Uint8Array): Promise<unknown> {
  const raw = await decompressPayload(data)
  return JSON.parse(decoder.decode(raw))
}

export interface OAuthResponderDeps {
  nc: NatsConnection
  store: OAuthSettingsStore
}

export interface OAuthResponderHandle {
  dispose(): void
}

interface CommandResult {
  ok: boolean
  error?: string
  settings?: ClaudeAuthSettings
  entry?: OAuthTokenEntry
  removed?: boolean
}

export function registerOAuthResponders(deps: OAuthResponderDeps): OAuthResponderHandle {
  const { nc, store } = deps
  const sub: Subscription = nc.subscribe(ALL_OAUTH_COMMANDS)

  ;(async () => {
    for await (const msg of sub) {
      const subject = msg.subject
      const type = subject.replace(/^runtime\.cmd\./, "")
      let payload: Record<string, unknown> = {}
      try {
        payload = (await decode(msg.data)) as Record<string, unknown>
      } catch {
        msg.respond?.(encode({ ok: false, error: "invalid JSON payload" } satisfies CommandResult))
        continue
      }
      try {
        const result = await dispatch(type, payload, store)
        if (result.ok && type !== "oauth.list") {
          try {
            nc.publish(oauthChangedSubject(), encode({ settings: store.getSnapshot() }))
          } catch (err) {
            console.warn(LOG_PREFIX, "changed publish failed:", err instanceof Error ? err.message : String(err))
          }
        }
        msg.respond?.(encode(result))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(LOG_PREFIX, `responder error for ${type}: ${message}`)
        msg.respond?.(encode({ ok: false, error: message } satisfies CommandResult))
      }
    }
  })().catch((err) => {
    console.warn(LOG_PREFIX, "responder loop terminated:", err instanceof Error ? err.message : String(err))
  })

  return {
    dispose() {
      sub.unsubscribe()
    },
  }
}

async function dispatch(
  type: string,
  payload: Record<string, unknown>,
  store: OAuthSettingsStore,
): Promise<CommandResult> {
  switch (type) {
    case "oauth.list":
      return { ok: true, settings: store.getSnapshot() }

    case "oauth.add": {
      const label = requireString(payload, "label").trim()
      const token = requireString(payload, "token")
      if (label.length === 0 || label.length > OAUTH_TOKEN_LABEL_MAX) {
        return { ok: false, error: `label must be 1..${OAUTH_TOKEN_LABEL_MAX} chars` }
      }
      if (token.length === 0 || token.length > OAUTH_TOKEN_VALUE_MAX) {
        return { ok: false, error: `token must be 1..${OAUTH_TOKEN_VALUE_MAX} chars` }
      }
      const maxConcurrent = normalizeMaxConcurrent(payload.maxConcurrent)
      if (maxConcurrent === "invalid") {
        return { ok: false, error: `maxConcurrent must be in [${OAUTH_TOKEN_MAX_CONCURRENT_MIN}, ${OAUTH_TOKEN_MAX_CONCURRENT_MAX}]` }
      }
      const entry = await store.addToken({
        label,
        token,
        ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
      })
      return { ok: true, entry }
    }

    case "oauth.remove": {
      const id = requireString(payload, "id")
      const removed = await store.removeToken(id)
      return { ok: true, removed }
    }

    case "oauth.update": {
      const id = requireString(payload, "id")
      const patch: { label?: string; maxConcurrent?: number | null } = {}
      if (typeof payload.label === "string") patch.label = payload.label
      if (payload.maxConcurrent === null) patch.maxConcurrent = null
      else if (typeof payload.maxConcurrent === "number") {
        const v = normalizeMaxConcurrent(payload.maxConcurrent)
        if (v === "invalid") return { ok: false, error: "maxConcurrent out of range" }
        if (v !== undefined) patch.maxConcurrent = v
      }
      const entry = await store.updateToken(id, patch)
      if (!entry) return { ok: false, error: `unknown token id: ${id}` }
      return { ok: true, entry }
    }

    case "oauth.setConcurrencyDefault": {
      const value = payload.value
      if (typeof value !== "number" || value < OAUTH_TOKEN_MAX_CONCURRENT_MIN || value > OAUTH_TOKEN_MAX_CONCURRENT_MAX) {
        return { ok: false, error: `value must be in [${OAUTH_TOKEN_MAX_CONCURRENT_MIN}, ${OAUTH_TOKEN_MAX_CONCURRENT_MAX}]` }
      }
      await store.setConcurrencyDefault(value)
      return { ok: true }
    }

    default:
      return { ok: false, error: `unknown oauth command: ${type}` }
  }
}

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field]
  if (typeof value !== "string") {
    throw new Error(`missing required string field: ${field}`)
  }
  return value
}

function normalizeMaxConcurrent(raw: unknown): number | undefined | "invalid" {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== "number" || !Number.isFinite(raw)) return "invalid"
  const rounded = Math.round(raw)
  if (rounded < OAUTH_TOKEN_MAX_CONCURRENT_MIN || rounded > OAUTH_TOKEN_MAX_CONCURRENT_MAX) return "invalid"
  return rounded
}

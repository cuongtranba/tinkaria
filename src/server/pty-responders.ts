/**
 * PTY NATS responders — additive surface for claude-pty provider.
 *
 * Subjects (all under `runtime.cmd.pty.*`):
 *   - pty.spawn   { chatId, projectId, cwd, model, planMode?, oauthToken?, oauthLabel? } -> { ok, sessionToken? }
 *   - pty.input   { chatId, data: string }                          -> { ok }
 *   - pty.resize  { chatId, cols, rows }                            -> { ok }
 *   - pty.cancel  { chatId, signal?: "SIGTERM" | "SIGKILL" }        -> { ok }
 *   - pty.exit    { chatId }                                        -> { ok }
 *   - pty.snapshot {}                                               -> { ok, instances }
 *
 * Delta broadcast: `runtime.evt.pty.delta` carries `PtyInstanceDelta`.
 */

import type { NatsConnection, Subscription } from "@nats-io/transport-node"
import { compressPayload, decompressPayload } from "../shared/compression"
import { ALL_PTY_COMMANDS, ptyDeltaSubject } from "../shared/nats-subjects"
import type { PtyInstanceDelta, PtyInstanceState } from "../shared/pty-instance"
import { createPtyInstanceRegistry } from "./claude-pty/pty-instance-registry"
import { startClaudeSessionPTY, type StartClaudeSessionPtyArgs } from "./claude-pty/driver"
import type { ClaudeSessionHandle } from "./claude-pty/agent-normalizers"
import type { EventStore } from "./event-store"
import type { OAuthTokenPool } from "./oauth-pool/oauth-token-pool"

const LOG_PREFIX = "[claude-pty]"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(data: unknown): Uint8Array {
  return compressPayload(encoder.encode(JSON.stringify(data)))
}

async function decode(data: Uint8Array): Promise<unknown> {
  const raw = await decompressPayload(data)
  return JSON.parse(decoder.decode(raw))
}

export interface PtyResponderDeps {
  nc: NatsConnection
  store: EventStore
  oauthPool?: OAuthTokenPool
}

export interface PtyResponderHandle {
  dispose(): void
  registry: ReturnType<typeof createPtyInstanceRegistry>
}

interface CommandResult {
  ok: boolean
  error?: string
  instance?: PtyInstanceState
  instances?: PtyInstanceState[]
  sessionToken?: string | null
}

interface ActiveSession {
  handle: ClaudeSessionHandle
}

export function registerPtyResponders(deps: PtyResponderDeps): PtyResponderHandle {
  const { nc, store, oauthPool } = deps
  const registry = createPtyInstanceRegistry()
  const sessions = new Map<string, ActiveSession>()

  const unsubscribe = registry.subscribe((delta: PtyInstanceDelta) => {
    try {
      nc.publish(ptyDeltaSubject(), encode(delta))
    } catch (err) {
      console.warn(LOG_PREFIX, "delta publish failed:", err instanceof Error ? err.message : String(err))
    }
  })

  const sub: Subscription = nc.subscribe(ALL_PTY_COMMANDS)

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
        const result = await dispatch(type, payload, registry, sessions, store, oauthPool)
        msg.respond?.(encode(result))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(LOG_PREFIX, `responder error for ${type}: ${message}`)
        msg.respond?.(encode({ ok: false, error: message } satisfies CommandResult))
      }
    }
  })().catch((err) => {
    console.warn(LOG_PREFIX, "pty responder loop terminated:", err instanceof Error ? err.message : String(err))
  })

  return {
    registry,
    dispose() {
      try {
        unsubscribe()
      } catch {
        // ignore
      }
      for (const [, session] of sessions) {
        try {
          session.handle.close()
        } catch {
          // ignore
        }
      }
      sessions.clear()
      sub.unsubscribe()
    },
  }
}

async function dispatch(
  type: string,
  payload: Record<string, unknown>,
  registry: ReturnType<typeof createPtyInstanceRegistry>,
  sessions: Map<string, ActiveSession>,
  store: EventStore,
  oauthPool: OAuthTokenPool | undefined,
): Promise<CommandResult> {
  switch (type) {
    case "pty.snapshot":
      return { ok: true, instances: registry.snapshot() }

    case "pty.spawn": {
      const chatId = requireString(payload, "chatId")
      const projectId = requireString(payload, "projectId")
      const cwd = requireString(payload, "cwd")
      const model = requireString(payload, "model")
      const planMode = Boolean(payload.planMode)
      let oauthToken = (payload.oauthToken as string | undefined) ?? null
      let oauthLabel = (payload.oauthLabel as string | undefined) ?? undefined
      const sessionToken = (payload.sessionToken as string | undefined) ?? null
      const forkSession = Boolean(payload.forkSession)

      if (sessions.has(chatId)) {
        return { ok: false, error: `pty already live for chatId=${chatId}` }
      }

      // Auto-pick from pool if caller didn't supply a token explicitly.
      let poolTokenId: string | null = null
      if (!oauthToken && oauthPool) {
        if (!oauthPool.hasAnyToken()) {
          return {
            ok: false,
            error: "No OAuth pool tokens configured. Add one under Settings → Claude PTY.",
          }
        }
        const picked = oauthPool.pickActive(chatId)
        if (!picked) {
          const unavail = oauthPool.describeUnavailability(chatId)
          const summary = unavail
            .filter((u) => u.reason !== "available")
            .map((u) => `${u.label}: ${u.reason}`)
            .join("; ")
          return {
            ok: false,
            error: `No usable OAuth pool token (${summary || "all tokens unavailable"}).`,
          }
        }
        oauthToken = picked.token
        oauthLabel = picked.label
        oauthPool.markUsed(picked.id)
        poolTokenId = picked.id
      }

      const spawnArgs: StartClaudeSessionPtyArgs = {
        chatId,
        projectId,
        localPath: cwd,
        model,
        planMode,
        forkSession,
        oauthToken,
        sessionToken,
        oauthLabel,
        ptyInstanceRegistry: registry,
        onToolRequest: async () => ({ ok: true }),
      }

      console.log(LOG_PREFIX, `spawn requested chatId=${chatId} model=${model}`)
      const handle = await startClaudeSessionPTY(spawnArgs)
      sessions.set(chatId, { handle })

      ;(async () => {
        // rotation guard: when a token is marked limited/error the pool
        // already drops its reservation set, so finally{} must skip the
        // plain release(chatId) path to avoid touching unrelated tokens.
        let poolRotated = false
        try {
          for await (const event of handle.stream) {
            if (event.type === "transcript" && event.entry) {
              try {
                store.appendMessage(chatId, event.entry)
              } catch (err) {
                console.warn(
                  LOG_PREFIX,
                  `appendMessage skipped chatId=${chatId}:`,
                  err instanceof Error ? err.message : String(err),
                )
              }
            } else if (event.type === "session_token" && event.sessionToken) {
              try {
                await store.setPtySessionToken(chatId, "claude-pty", event.sessionToken)
              } catch (err) {
                console.warn(
                  LOG_PREFIX,
                  `setPtySessionToken failed chatId=${chatId}:`,
                  err instanceof Error ? err.message : String(err),
                )
              }
            } else if (event.type === "rate_limit" && event.rateLimit) {
              console.log(LOG_PREFIX, `rate_limit chatId=${chatId}`, event.rateLimit)
              try {
                store.appendMessage(chatId, {
                  _id: `pty-rate-limit-${Date.now()}`,
                  kind: "rate_limit",
                  rateLimit: event.rateLimit,
                  createdAt: Date.now(),
                })
              } catch (err) {
                console.warn(
                  LOG_PREFIX,
                  `rate_limit append skipped chatId=${chatId}:`,
                  err instanceof Error ? err.message : String(err),
                )
              }
              if (poolTokenId && oauthPool) {
                try {
                  const stale = oauthPool.takeStaleOwners(poolTokenId)
                  oauthPool.markLimited(poolTokenId, event.rateLimit.resetAt)
                  poolRotated = true
                  console.log(
                    LOG_PREFIX,
                    `pool token ${poolTokenId} marked limited until ${event.rateLimit.resetAt}; stale owners=${stale.length}`,
                  )
                } catch (err) {
                  console.warn(
                    LOG_PREFIX,
                    `markLimited failed token=${poolTokenId}:`,
                    err instanceof Error ? err.message : String(err),
                  )
                }
              }
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.warn(LOG_PREFIX, `stream error chatId=${chatId}:`, message)
          if (poolTokenId && oauthPool) {
            try {
              const stale = oauthPool.takeStaleOwners(poolTokenId)
              oauthPool.markError(poolTokenId, message)
              poolRotated = true
              console.log(
                LOG_PREFIX,
                `pool token ${poolTokenId} marked error; stale owners=${stale.length}`,
              )
            } catch (markErr) {
              console.warn(
                LOG_PREFIX,
                `markError failed token=${poolTokenId}:`,
                markErr instanceof Error ? markErr.message : String(markErr),
              )
            }
          }
        } finally {
          sessions.delete(chatId)
          if (poolTokenId && oauthPool && !poolRotated) {
            try { oauthPool.release(chatId) } catch { /* ignore */ }
          }
        }
      })().catch(() => undefined)

      return { ok: true }
    }

    case "pty.input": {
      const chatId = requireString(payload, "chatId")
      const data = requireString(payload, "data")
      const session = sessions.get(chatId)
      if (!session) return { ok: false, error: `no live pty for chatId=${chatId}` }
      await session.handle.sendPrompt(data)
      return { ok: true }
    }

    case "pty.resize": {
      const chatId = requireString(payload, "chatId")
      // Driver does not expose resize on ClaudeSessionHandle directly —
      // PtyProcess.resize lives inside the driver. Surface a no-op so
      // clients can drive cols/rows without errors.
      void chatId
      return { ok: true }
    }

    case "pty.cancel": {
      const chatId = requireString(payload, "chatId")
      const session = sessions.get(chatId)
      if (session) {
        await session.handle.interrupt().catch(() => undefined)
        session.handle.close()
        sessions.delete(chatId)
      }
      registry.remove(chatId)
      if (oauthPool) {
        try { oauthPool.release(chatId) } catch { /* ignore */ }
      }
      return { ok: true }
    }

    case "pty.exit": {
      const chatId = requireString(payload, "chatId")
      const session = sessions.get(chatId)
      if (session) {
        session.handle.close()
        sessions.delete(chatId)
      }
      registry.remove(chatId)
      if (oauthPool) {
        try { oauthPool.release(chatId) } catch { /* ignore */ }
      }
      return { ok: true }
    }

    default:
      return { ok: false, error: `unknown pty command: ${type}` }
  }
}

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing required string field: ${field}`)
  }
  return value
}

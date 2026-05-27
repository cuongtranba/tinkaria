/**
 * Turn factory wrappers for the runner process.
 *
 * Re-exports startClaudeTurn from claude-harness.ts and provides
 * startCodexTurn / startClaudePtyTurn so the runner can create harness turns
 * for all providers.
 *
 * Lifecycle ownership for claude-pty:
 *   • `claudePtySessions` — module-level Map<chatId, ClaudePtySession>.
 *     Mirrors kanna's `claudeSessions` map. PTY handle persists across
 *     turns so the live `claude` CLI keeps in-memory context.
 *   • `OAuthTokenPool` — single instance constructed in `runner.ts` and
 *     handed to the factory at boot. `pickActive(chatId)` reserves a token
 *     for the chat; `release(chatId)` drops it on turn end / session close.
 *     `markLimited` / `markError` rotate the token on rate_limit / stream
 *     error events. Mirrors kanna's `AgentCoordinator` rotation discipline.
 *   • `ClaudePtyRegistry` — on-disk pidfile registry. Driver writes its pid
 *     + runtimeDir before sending the first prompt and unregisters during
 *     cleanup. Boot's `reapStale()` SIGKILLs orphans from a previous crash.
 *   • Idle sweeper — `sweepIdleClaudePtySessions(now, idleMs)` closes any
 *     session whose `lastUsedAt` is past the TTL. Scheduled from runner.ts
 *     so the runner controls cadence + can `unref()` the timer.
 */

export { startClaudeTurn } from "../server/claude-harness"

import { CodexAppServerManager } from "../server/codex-app-server"
import type { HarnessToolRequest, HarnessTurn } from "../shared/harness-types"
import type { CodexReasoningEffort, ServiceTier } from "../shared/types"
import { startClaudeSessionPTY } from "../server/claude-pty/driver"
import { ptyDeltaSubject } from "../shared/nats-subjects"
import { compressPayload } from "../shared/compression"
import type { NatsConnection } from "@nats-io/transport-node"
import type { PtyInstanceDelta, PtyInstanceState } from "../shared/pty-instance"
import type { HarnessEvent } from "../shared/harness-types"
import type { ClaudeSessionHandle } from "../server/claude-pty/agent-normalizers"
import type { OAuthTokenPool } from "../server/oauth-pool/oauth-token-pool"
import type { ClaudePtyRegistry } from "../server/claude-pty/pid-registry.adapter"
import { spawnSync } from "node:child_process"

const ptyDeltaEncoder = new TextEncoder()
function encodeDelta(delta: PtyInstanceDelta): Uint8Array {
  return compressPayload(ptyDeltaEncoder.encode(JSON.stringify(delta)))
}

interface ClaudePtySession {
  chatId: string
  handle: ClaudeSessionHandle
  baseInstance: PtyInstanceState
  currentTurn: TurnDispatcher | null
  turnCount: number
  /** Pool reservation id; null when no pool was available (test/fake paths). */
  activeTokenId: string | null
  /** Timestamp of the last turn end (or session start). Used by idle sweeper. */
  lastUsedAt: number
  publishDelta: (delta: PtyInstanceDelta) => void
}

interface TurnDispatcher {
  push(event: HarnessEvent): void
  end(): void
  stream: AsyncIterable<HarnessEvent>
}

function createTurnDispatcher(): TurnDispatcher {
  const queue: HarnessEvent[] = []
  const waiters: Array<(r: IteratorResult<HarnessEvent>) => void> = []
  let ended = false

  function push(event: HarnessEvent): void {
    if (ended) return
    const waiter = waiters.shift()
    if (waiter) waiter({ value: event, done: false })
    else queue.push(event)
  }

  function end(): void {
    if (ended) return
    ended = true
    while (waiters.length > 0) {
      const waiter = waiters.shift()
      if (waiter) waiter({ value: undefined as unknown as HarnessEvent, done: true })
    }
  }

  const stream: AsyncIterable<HarnessEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<HarnessEvent>> {
          if (queue.length > 0) {
            const value = queue.shift() as HarnessEvent
            return Promise.resolve({ value, done: false })
          }
          if (ended) return Promise.resolve({ value: undefined as unknown as HarnessEvent, done: true })
          return new Promise((resolve) => waiters.push(resolve))
        },
      }
    },
  }

  return { push, end, stream }
}

const claudePtySessions = new Map<string, ClaudePtySession>()

// Single pool + registry instance shared across all turns. Set by runner.ts at boot.
let sharedPool: OAuthTokenPool | null = null
let sharedRegistry: ClaudePtyRegistry | null = null

export function configureClaudePtyFactory(args: {
  pool: OAuthTokenPool | null
  registry: ClaudePtyRegistry | null
}): void {
  sharedPool = args.pool
  sharedRegistry = args.registry
}

function startSessionReader(session: ClaudePtySession): void {
  void (async () => {
    // `poolRotated` mirrors pty-responders semantics: when rate_limit /
    // stream error marks the token limited/errored, the pool's
    // `takeStaleOwners` already drops the reservation for this chat. The
    // finally{} block must skip its plain `release(chatId)` in that case
    // so it does not touch unrelated tokens (audit #9d).
    let poolRotated = false
    try {
      for await (const event of session.handle.stream) {
        if (event.type === "rate_limit" && event.rateLimit) {
          console.log("[claude-pty/runner] rate_limit chatId=" + session.chatId, event.rateLimit)
          if (session.activeTokenId && sharedPool) {
            try {
              const stale = sharedPool.takeStaleOwners(session.activeTokenId)
              sharedPool.markLimited(session.activeTokenId, event.rateLimit.resetAt)
              poolRotated = true
              console.log(
                "[claude-pty/runner] pool token " + session.activeTokenId
                + " marked limited until " + event.rateLimit.resetAt
                + "; stale owners=" + stale.length,
              )
            } catch (err) {
              console.warn(
                "[claude-pty/runner] markLimited failed token=" + session.activeTokenId,
                err instanceof Error ? err.message : String(err),
              )
            }
          }
        }
        session.currentTurn?.push(event)
        const entry = (event as { entry?: { kind?: string } }).entry
        if (entry?.kind === "result") {
          session.lastUsedAt = Date.now()
          session.currentTurn?.end()
          session.currentTurn = null
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn("[claude-pty/runner] session reader error:", message)
      if (session.activeTokenId && sharedPool) {
        try {
          const stale = sharedPool.takeStaleOwners(session.activeTokenId)
          sharedPool.markError(session.activeTokenId, message)
          poolRotated = true
          console.log(
            "[claude-pty/runner] pool token " + session.activeTokenId
            + " marked error; stale owners=" + stale.length,
          )
        } catch (markErr) {
          console.warn(
            "[claude-pty/runner] markError failed token=" + session.activeTokenId,
            markErr instanceof Error ? markErr.message : String(markErr),
          )
        }
      }
    } finally {
      session.currentTurn?.end()
      if (claudePtySessions.get(session.chatId) === session) {
        claudePtySessions.delete(session.chatId)
      }
      if (!poolRotated && session.activeTokenId && sharedPool) {
        try { sharedPool.release(session.chatId) } catch { /* swallow */ }
      }
      session.publishDelta({ type: "removed", chatId: session.chatId })
    }
  })()
}

export function stopClaudePtySession(chatId: string): void {
  const session = claudePtySessions.get(chatId)
  if (!session) return
  try { session.handle.close() } catch { /* swallow */ }
  // Map entry + pool release will be cleared by the background reader's
  // finally{} block once the stream observes the close. Delete eagerly so
  // a racing `start_turn` for the same chatId does not reuse this handle.
  claudePtySessions.delete(chatId)
}

export function stopAllClaudePtySessions(): void {
  for (const [, session] of claudePtySessions) {
    try { session.handle.close() } catch { /* swallow */ }
  }
  claudePtySessions.clear()
}

/** Test-only inspector for the live session map. */
export function getClaudePtySessionChatIds(): string[] {
  return [...claudePtySessions.keys()]
}

/**
 * Close any session whose `lastUsedAt` is older than `idleMs` and has no
 * active turn. Mirrors kanna's `sweepIdleClaudeSessions`. Runs from a
 * setInterval in runner.ts; the runner owns timer cadence.
 */
export function sweepIdleClaudePtySessions(now: number, idleMs: number): number {
  let closed = 0
  for (const [chatId, session] of [...claudePtySessions.entries()]) {
    if (session.currentTurn !== null) continue
    if (now - session.lastUsedAt < idleMs) continue
    console.log("[claude-pty/runner] idle TTL eviction chatId=" + chatId + " idleMs=" + (now - session.lastUsedAt))
    try { session.handle.close() } catch { /* swallow */ }
    claudePtySessions.delete(chatId)
    closed += 1
  }
  return closed
}

let codexManager: CodexAppServerManager | null = null

/**
 * Resolve the codex binary runner-side by checking PATH, then falling back to
 * the well-known `codex` name (lets the shell find it via the runner's PATH).
 * Always runner-local — never relies on a server-sent binaryPath.
 */
function resolveCodexBinary(extraEnv?: Record<string, string>): string {
  // Runner-local resolution: NEVER let a server-supplied PATH redirect which
  // binary we run (security M1) — strip PATH so the runner's own PATH decides.
  const { PATH: _serverPath, ...safeEnv } = extraEnv ?? {}
  const env = { ...process.env, ...safeEnv }
  const which = spawnSync("which", ["codex"], { encoding: "utf-8", timeout: 3000, env })
  if (which.status === 0) {
    const p = which.stdout.trim()
    if (p) return p
  }
  // Fall back: let the OS resolve it at spawn time
  return "codex"
}

// NOTE: the codex manager is a once-per-runner-lifetime singleton — the first
// turn's (PATH-stripped) extraEnv fixes the manager. The binary is always
// runner-local (PATH stripped above), so this cannot be steered by the server.
function getCodexManager(extraEnv?: Record<string, string>): CodexAppServerManager {
  if (!codexManager) {
    // Strip server-supplied PATH from the spawned process env too (M1).
    const { PATH: _serverPath, ...safeEnv } = extraEnv ?? {}
    const binaryPath = resolveCodexBinary(safeEnv)
    codexManager = new CodexAppServerManager({ binaryPath, extraEnv: safeEnv })
  }
  return codexManager
}

export async function startCodexTurn(args: {
  chatId: string
  content: string
  localPath: string
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  extraEnv?: Record<string, string>
}): Promise<HarnessTurn> {
  const manager = getCodexManager(args.extraEnv)

  await manager.startSession({
    chatId: args.chatId,
    cwd: args.localPath,
    model: args.model,
    serviceTier: args.serviceTier as ServiceTier | undefined,
    sessionToken: args.sessionToken,
  })

  return await manager.startTurn({
    chatId: args.chatId,
    content: args.content,
    model: args.model,
    effort: args.effort as CodexReasoningEffort | undefined,
    serviceTier: args.serviceTier as ServiceTier | undefined,
    planMode: args.planMode,
    onToolRequest: args.onToolRequest,
  })
}

function buildPoolUnavailableMessage(reservedFor: string): string {
  if (!sharedPool) return "OAuth pool is not configured on the runner."
  if (!sharedPool.hasAnyToken()) {
    return "No OAuth pool tokens configured. Add one under Settings → Claude PTY."
  }
  const summary = sharedPool
    .describeUnavailability(reservedFor)
    .filter((u) => u.reason !== "available")
    .map((u) => (u.label || u.tokenId.slice(0, 8)) + ": " + u.reason)
    .join("; ")
  return "No usable OAuth pool token (" + (summary || "all tokens unavailable") + ")."
}

export async function startClaudePtyTurn(args: {
  chatId: string
  content: string
  projectId?: string
  localPath: string
  model: string
  effort?: string
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  nc?: NatsConnection
}): Promise<HarnessTurn> {
  let session = claudePtySessions.get(args.chatId)

  if (!session) {
    if (!sharedPool) {
      throw new Error("Claude PTY runner is not wired to an OAuthTokenPool. Configure via configureClaudePtyFactory().")
    }
    if (!sharedPool.hasAnyToken()) {
      throw new Error("No OAuth pool tokens configured. Add one under Settings → Claude PTY.")
    }
    const picked = sharedPool.pickActive(args.chatId)
    if (!picked) {
      throw new Error(buildPoolUnavailableMessage(args.chatId))
    }
    sharedPool.markUsed(picked.id)

    const now = Date.now()
    const baseInstance: PtyInstanceState = {
      chatId: args.chatId,
      sessionId: null,
      pid: null,
      cwd: args.localPath,
      model: args.model,
      accountLabel: picked.label,
      oauthMasked: null,
      phase: "spawning",
      startedAt: now,
      lastEventAt: now,
      turnCount: 0,
      tokensIn: 0,
      tokensOut: 0,
      planMode: args.planMode,
      smokeTest: null,
      outputRingTail: null,
      exitedAt: null,
      exitCode: null,
      rssBytes: null,
      rssPeakBytes: null,
      cpuPercent: null,
      cpuPeakPercent: null,
    }

    function publishDelta(delta: PtyInstanceDelta): void {
      if (!args.nc) return
      try {
        args.nc.publish(ptyDeltaSubject(), encodeDelta(delta))
      } catch (err) {
        console.warn("[claude-pty/runner] pty.delta publish failed:", err instanceof Error ? err.message : String(err))
      }
    }

    publishDelta({ type: "added", instance: baseInstance })

    let handle: ClaudeSessionHandle
    try {
      handle = await startClaudeSessionPTY({
        chatId: args.chatId,
        projectId: args.projectId ?? args.chatId,
        localPath: args.localPath,
        model: args.model,
        effort: args.effort,
        planMode: args.planMode,
        sessionToken: args.sessionToken,
        forkSession: false,
        oauthToken: picked.token,
        oauthLabel: picked.label,
        ptyRegistry: sharedRegistry ?? undefined,
        onToolRequest: args.onToolRequest as never,
      })
    } catch (err) {
      publishDelta({ type: "removed", chatId: args.chatId })
      try { sharedPool.release(args.chatId) } catch { /* swallow */ }
      throw err
    }

    publishDelta({ type: "updated", instance: { ...baseInstance, phase: "ready", lastEventAt: Date.now() } })

    session = {
      chatId: args.chatId,
      handle,
      baseInstance,
      currentTurn: null,
      turnCount: 0,
      activeTokenId: picked.id,
      lastUsedAt: Date.now(),
      publishDelta,
    }
    claudePtySessions.set(args.chatId, session)
    startSessionReader(session)
  }

  const dispatcher = createTurnDispatcher()
  session.currentTurn = dispatcher
  session.turnCount += 1
  session.lastUsedAt = Date.now()
  session.publishDelta({
    type: "updated",
    instance: {
      ...session.baseInstance,
      phase: "streaming",
      lastEventAt: Date.now(),
      turnCount: session.turnCount,
    },
  })

  await session.handle.sendPrompt(args.content)

  return {
    provider: "claude-pty",
    stream: dispatcher.stream,
    interrupt: async () => {
      try {
        await session!.handle.interrupt()
      } finally {
        dispatcher.end()
        if (session!.currentTurn === dispatcher) {
          session!.currentTurn = null
          session!.lastUsedAt = Date.now()
        }
      }
    },
    close: () => {
      dispatcher.end()
      if (session!.currentTurn === dispatcher) {
        session!.currentTurn = null
        session!.lastUsedAt = Date.now()
      }
    },
  }
}

export function stopCodexSession(chatId: string): void {
  codexManager?.stopSession(chatId)
}

export function stopAllCodexSessions(): void {
  codexManager?.stopAll()
}

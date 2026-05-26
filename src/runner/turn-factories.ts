/**
 * Turn factory wrappers for the runner process.
 *
 * Re-exports startClaudeTurn from claude-harness.ts and provides startCodexTurn
 * so the runner can create harness turns for both providers.
 */

export { startClaudeTurn } from "../server/claude-harness"

import { CodexAppServerManager } from "../server/codex-app-server"
import type { HarnessToolRequest, HarnessTurn } from "../shared/harness-types"
import type { CodexReasoningEffort, ServiceTier } from "../shared/types"
import { startClaudeSessionPTY } from "../server/claude-pty/driver"
import { OAuthSettingsStore } from "../server/oauth-pool/oauth-settings-store"
import { ptyDeltaSubject } from "../shared/nats-subjects"
import { compressPayload } from "../shared/compression"
import type { NatsConnection } from "@nats-io/transport-node"
import type { PtyInstanceDelta, PtyInstanceState } from "../shared/pty-instance"
import type { HarnessEvent } from "../shared/harness-types"
import type { ClaudeSessionHandle } from "../server/claude-pty/agent-normalizers"

const ptyDeltaEncoder = new TextEncoder()
function encodeDelta(delta: PtyInstanceDelta): Uint8Array {
  return compressPayload(ptyDeltaEncoder.encode(JSON.stringify(delta)))
}

/**
 * Long-lived PTY session bookkeeping.
 *
 * Mirrors kanna's `claudeSessions` map in `agent.ts`: the PTY handle persists
 * across turns so the live `claude` CLI process keeps its in-memory context
 * (transcript, tool acks, plan-mode state, etc.). Each `start_turn` for an
 * existing chatId reuses the handle and just calls `handle.sendPrompt`.
 *
 * A single background reader pumps events out of `handle.stream` and routes
 * them to whichever turn is "current" (the one whose HarnessTurn was last
 * returned by `startClaudePtyTurn`). Per-turn streams end on the first
 * `result` transcript entry; the PTY handle itself stays alive.
 */
interface ClaudePtySession {
  chatId: string
  handle: ClaudeSessionHandle
  baseInstance: PtyInstanceState
  /** Active turn waiting on the next `result` event. Cleared on turn end. */
  currentTurn: TurnDispatcher | null
  turnCount: number
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

function startSessionReader(session: ClaudePtySession): void {
  void (async () => {
    try {
      for await (const event of session.handle.stream) {
        session.currentTurn?.push(event)
        const entry = (event as { entry?: { kind?: string } }).entry
        if (entry?.kind === "result") {
          session.currentTurn?.end()
          session.currentTurn = null
        }
      }
    } catch (err) {
      console.warn("[claude-pty/runner] session reader error:", err instanceof Error ? err.message : String(err))
    } finally {
      session.currentTurn?.end()
      claudePtySessions.delete(session.chatId)
      session.publishDelta({ type: "removed", chatId: session.chatId })
    }
  })()
}

export function stopClaudePtySession(chatId: string): void {
  const session = claudePtySessions.get(chatId)
  if (!session) return
  try { session.handle.close() } catch { /* swallow */ }
  claudePtySessions.delete(chatId)
}

export function stopAllClaudePtySessions(): void {
  for (const [, session] of claudePtySessions) {
    try { session.handle.close() } catch { /* swallow */ }
  }
  claudePtySessions.clear()
}

// Singleton: one CodexAppServerManager per runner process, manages all Codex child processes.
let codexManager: CodexAppServerManager | null = null

function getCodexManager(binaryPath?: string, extraEnv?: Record<string, string>): CodexAppServerManager {
  if (!codexManager) {
    codexManager = new CodexAppServerManager({ binaryPath, extraEnv })
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
  binaryPath?: string
  extraEnv?: Record<string, string>
}): Promise<HarnessTurn> {
  const manager = getCodexManager(args.binaryPath, args.extraEnv)

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
    const oauthStore = new OAuthSettingsStore()
    await oauthStore.load()
    const active = oauthStore.getSnapshot().tokens.find((t) => t.status === "active")
    if (!active) {
      throw new Error("No active OAuth pool token. Add one under Settings → Claude PTY.")
    }

    const now = Date.now()
    const baseInstance: PtyInstanceState = {
      chatId: args.chatId,
      sessionId: null,
      pid: null,
      cwd: args.localPath,
      model: args.model,
      accountLabel: active.label,
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
        oauthToken: active.token,
        oauthLabel: active.label,
        onToolRequest: args.onToolRequest as never,
      })
    } catch (err) {
      publishDelta({ type: "removed", chatId: args.chatId })
      throw err
    }

    publishDelta({ type: "updated", instance: { ...baseInstance, phase: "ready", lastEventAt: Date.now() } })

    session = {
      chatId: args.chatId,
      handle,
      baseInstance,
      currentTurn: null,
      turnCount: 0,
      publishDelta,
    }
    claudePtySessions.set(args.chatId, session)
    startSessionReader(session)
  }

  const dispatcher = createTurnDispatcher()
  session.currentTurn = dispatcher
  session.turnCount += 1
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
        if (session!.currentTurn === dispatcher) session!.currentTurn = null
      }
    },
    close: () => {
      dispatcher.end()
      if (session!.currentTurn === dispatcher) session!.currentTurn = null
    },
  }
}

export function stopCodexSession(chatId: string): void {
  codexManager?.stopSession(chatId)
}

export function stopAllCodexSessions(): void {
  codexManager?.stopAll()
}

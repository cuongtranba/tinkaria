import { jetstream, type JetStream } from "@nats-io/jetstream"
import type { NatsConnection } from "@nats-io/transport-node"
import { existsSync } from "node:fs"
import { LOG_PREFIX } from "../shared/branding"
import type { HarnessToolRequest, HarnessTurn } from "../shared/harness-types"
import {
  runnerEventsSubject,
  type RunnerTurnEvent,
  type StartTurnCommand,
} from "../shared/runner-protocol"
import type {
  AgentProvider,
  NormalizedToolCall,
  PendingToolSnapshot,
  SessionStatus,
  TranscriptEntry,
} from "../shared/types"
import { timestamped, discardedToolResult } from "../shared/transcript-entries"
import type { CoordinationStore } from "../shared/coordination-store"

const encoder = new TextEncoder()
const CANCEL_INTERRUPT_TIMEOUT_MS = 2_000

// ── Types ───────────────────────────────────────────────────────────

export type TurnFactory = (args: {
  provider: AgentProvider
  content: string
  localPath: string
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  chatId: string
  store?: CoordinationStore
  extraEnv?: Record<string, string>
}) => Promise<HarnessTurn>

function buildHarnessInput(cmd: StartTurnCommand): string {
  if (!cmd.delegatedContext?.trim()) {
    return cmd.content
  }
  return `${cmd.delegatedContext}\n\nNew task:\n${cmd.content}`
}

interface PendingToolRequest {
  toolUseId: string
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
  resolve: (result: unknown) => void
}

interface ActiveTurn {
  chatId: string
  provider: AgentProvider
  turn: HarnessTurn
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  status: SessionStatus
  pendingTool: PendingToolRequest | null
  postToolFollowUp: { content: string; planMode: boolean } | null
  hasFinalResult: boolean
  cancelRequested: boolean
  cancelRecorded: boolean
  /** Preserved from the original StartTurnCommand for follow-up turns */
  originalCmd: StartTurnCommand
}

export interface RunnerAgentOptions {
  nc: NatsConnection
  createTurn: TurnFactory
  generateTitle?: (content: string, cwd: string) => Promise<string | null>
  coordinationStore?: CoordinationStore
  /**
   * Hook the runner calls when a chat is being torn down (cancel without
   * active turn, chat.delete). Implementation closes any live claude-pty
   * session for the chat. Wired from runner.ts to turn-factories.ts.
   */
  stopClaudePtySession?: (chatId: string) => void
}

// ── RunnerAgent ─────────────────────────────────────────────────────

export class RunnerAgent {
  private readonly js: JetStream
  private readonly nc: NatsConnection
  private readonly createTurn: TurnFactory
  private readonly generateTitle: ((content: string, cwd: string) => Promise<string | null>) | undefined
  private readonly coordinationStore: CoordinationStore | undefined
  private readonly stopClaudePtySessionFn: ((chatId: string) => void) | undefined
  readonly activeTurns = new Map<string, ActiveTurn>()

  constructor(options: RunnerAgentOptions) {
    this.nc = options.nc
    this.js = jetstream(options.nc)
    this.createTurn = options.createTurn
    this.generateTitle = options.generateTitle
    this.coordinationStore = options.coordinationStore
    this.stopClaudePtySessionFn = options.stopClaudePtySession
  }

  // ── Publishing ──────────────────────────────────────────────────

  private publishEvent(chatId: string, event: RunnerTurnEvent): void {
    const subject = runnerEventsSubject(chatId)
    void this.js.publish(subject, encoder.encode(JSON.stringify(event))).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `JetStream publish failed on ${subject}: ${message}`)
    })
  }

  private publishTranscript(chatId: string, entry: TranscriptEntry): void {
    this.publishEvent(chatId, { type: "transcript", chatId, entry })
  }

  // ── Public API ────────────────────────────────────────────────────

  getActiveStatuses(): Map<string, SessionStatus> {
    const statuses = new Map<string, SessionStatus>()
    for (const [chatId, turn] of this.activeTurns.entries()) {
      statuses.set(chatId, turn.status)
    }
    return statuses
  }

  getPendingTool(chatId: string): PendingToolSnapshot | null {
    const pending = this.activeTurns.get(chatId)?.pendingTool
    if (!pending) return null
    return { toolUseId: pending.toolUseId, toolKind: pending.tool.toolKind }
  }

  async startTurn(cmd: StartTurnCommand): Promise<void> {
    if (this.activeTurns.has(cmd.chatId)) {
      throw new Error("Chat is already running")
    }

    // Fail fast (instead of a silent 10s timeout) when the chat's workspace does
    // not exist on THIS runner — e.g. a remote runner handed a server-only path.
    // Launching the agent with a nonexistent cwd hangs the spawn, so the start_turn
    // request never gets a reply. Surface a clear, actionable error instead.
    if (cmd.workspaceLocalPath && !existsSync(cmd.workspaceLocalPath)) {
      throw new Error(
        `Workspace "${cmd.workspaceLocalPath}" does not exist on this runner machine. ` +
        `The workspace must exist on the runner to run a turn here — pick a runner that ` +
        `has this path, or make the path available on the runner.`,
      )
    }

    const shouldGenerateTitle =
      cmd.appendUserPrompt &&
      cmd.chatTitle === "New Chat" &&
      cmd.existingMessageCount === 0

    // Publish user prompt
    if (cmd.appendUserPrompt) {
      this.publishTranscript(
        cmd.chatId,
        timestamped({ kind: "user_prompt", content: cmd.content })
      )
    }

    // Create tool request handler
    const onToolRequest = async (request: HarnessToolRequest): Promise<unknown> => {
      const active = this.activeTurns.get(cmd.chatId)
      if (!active) throw new Error("Chat turn ended unexpectedly")

      active.status = "waiting_for_user"
      this.publishEvent(cmd.chatId, {
        type: "status_change",
        chatId: cmd.chatId,
        status: "waiting_for_user",
      })
      this.publishEvent(cmd.chatId, {
        type: "pending_tool",
        chatId: cmd.chatId,
        tool: { toolUseId: request.tool.toolId, toolKind: request.tool.toolKind },
      })

      return new Promise<unknown>((resolve) => {
        active.pendingTool = {
          toolUseId: request.tool.toolId,
          tool: request.tool,
          resolve,
        }
      })
    }

    // Start the harness turn — binary resolution is done inside each factory
    const turn = await this.createTurn({
      provider: cmd.provider,
      content: buildHarnessInput(cmd),
      localPath: cmd.workspaceLocalPath,
      model: cmd.model,
      planMode: cmd.planMode,
      sessionToken: cmd.sessionToken,
      onToolRequest,
      chatId: cmd.chatId,
      store: this.coordinationStore,
      extraEnv: cmd.extraEnv,
    })

    const active: ActiveTurn = {
      chatId: cmd.chatId,
      provider: cmd.provider,
      turn,
      model: cmd.model,
      planMode: cmd.planMode,
      status: "starting",
      pendingTool: null,
      postToolFollowUp: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
      originalCmd: cmd,
    }
    this.activeTurns.set(cmd.chatId, active)

    this.publishEvent(cmd.chatId, {
      type: "status_change",
      chatId: cmd.chatId,
      status: "starting",
    })

    // Background: title generation
    if (shouldGenerateTitle) {
      void this.generateTitleInBackground(cmd.chatId, cmd.content, cmd.workspaceLocalPath)
    }

    // Run the turn asynchronously
    void this.runTurn(active)
  }

  async cancel(chatId: string): Promise<void> {
    const active = this.activeTurns.get(chatId)
    if (!active) {
      // No active turn but a long-lived claude-pty session may still own a
      // claude CLI child, MCP HTTP server, file watcher, sampler interval,
      // and an OAuth pool reservation. Closing the session here matches
      // kanna's `closeChat` discipline — cancel of an idle chat must release
      // the PTY, not silently no-op.
      this.stopClaudePtySessionFn?.(chatId)
      return
    }

    active.cancelRequested = true

    const pendingTool = active.pendingTool
    active.pendingTool = null

    if (pendingTool) {
      const result = discardedToolResult(pendingTool.tool)
      this.publishTranscript(
        chatId,
        timestamped({ kind: "tool_result", toolId: pendingTool.toolUseId, content: result })
      )
      if (active.provider === "codex" && pendingTool.tool.toolKind === "exit_plan_mode") {
        pendingTool.resolve(result)
      }
    }

    this.publishTranscript(chatId, timestamped({ kind: "interrupted" }))
    this.publishEvent(chatId, { type: "turn_cancelled", chatId })
    active.cancelRecorded = true
    active.hasFinalResult = true
    this.activeTurns.delete(chatId)

    void this.interruptTurnAfterCancel(active).catch(() => {})
  }

  /**
   * Tear down any live claude-pty session for the chat unconditionally.
   * Called from RunnerProxy.disposeChat after a separate `cancel_turn`
   * has interrupted any in-flight turn. Always safe — no-op when the chat
   * has no session.
   */
  stopChatPty(chatId: string): void {
    this.stopClaudePtySessionFn?.(chatId)
  }

  async respondTool(chatId: string, toolUseId: string, result: unknown): Promise<void> {
    const active = this.activeTurns.get(chatId)
    if (!active?.pendingTool) throw new Error("No pending tool request")
    if (active.pendingTool.toolUseId !== toolUseId) throw new Error("Tool response does not match active request")

    const pending = active.pendingTool
    this.publishTranscript(
      chatId,
      timestamped({ kind: "tool_result", toolId: toolUseId, content: result })
    )

    active.pendingTool = null
    active.status = "running"

    this.publishEvent(chatId, { type: "pending_tool", chatId, tool: null })
    this.publishEvent(chatId, { type: "status_change", chatId, status: "running" })

    // Handle exit_plan_mode follow-up for Codex
    if (pending.tool.toolKind === "exit_plan_mode") {
      const res = (result ?? {}) as { confirmed?: boolean; clearContext?: boolean; message?: string }
      if (res.confirmed && res.clearContext) {
        this.publishEvent(chatId, { type: "session_token", chatId, sessionToken: "" })
        this.publishTranscript(chatId, timestamped({ kind: "context_cleared" }))
      }
      if (active.provider === "codex") {
        active.postToolFollowUp = res.confirmed
          ? {
              content: res.message
                ? `Proceed with the approved plan. Additional guidance: ${res.message}`
                : "Proceed with the approved plan.",
              planMode: false,
            }
          : {
              content: res.message
                ? `Revise the plan using this feedback: ${res.message}`
                : "Revise the plan using this feedback.",
              planMode: true,
            }
      }
    }

    pending.resolve(result)
  }

  // ── Private ───────────────────────────────────────────────────────

  private async generateTitleInBackground(chatId: string, content: string, cwd: string): Promise<void> {
    if (!this.generateTitle) return
    try {
      const title = await this.generateTitle(content, cwd)
      if (!title) return
      this.publishEvent(chatId, { type: "title_generated", chatId, title })
    } catch (_error) {
      // Ignore background title generation failures
    }
  }

  private async interruptTurnAfterCancel(active: ActiveTurn): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let timedOut = false
    let failed = false

    try {
      await Promise.race([
        active.turn.interrupt(),
        new Promise<void>((resolve) => {
          timeoutId = setTimeout(() => {
            timedOut = true
            resolve()
          }, CANCEL_INTERRUPT_TIMEOUT_MS)
        }),
      ])
    } catch (_error) {
      failed = true
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (timedOut || failed) {
        active.turn.close()
      }
    }
  }

  private async runTurn(active: ActiveTurn): Promise<void> {
    try {
      for await (const event of active.turn.stream) {
        if (active.cancelRequested) {
          continue
        }

        if (event.type === "session_token" && event.sessionToken) {
          this.publishEvent(active.chatId, {
            type: "session_token",
            chatId: active.chatId,
            sessionToken: event.sessionToken,
          })
          continue
        }

        if (!event.entry) continue

        this.publishTranscript(active.chatId, event.entry)

        if (event.entry.kind === "system_init") {
          active.status = "running"
          this.publishEvent(active.chatId, {
            type: "status_change",
            chatId: active.chatId,
            status: "running",
          })
        }

        if (event.entry.kind === "result") {
          active.hasFinalResult = true
          if (event.entry.isError) {
            this.publishEvent(active.chatId, {
              type: "turn_failed",
              chatId: active.chatId,
              error: event.entry.result || "Turn failed",
            })
          } else if (!active.cancelRequested) {
            this.publishEvent(active.chatId, {
              type: "turn_finished",
              chatId: active.chatId,
            })
          }
        }
      }
    } catch (error) {
      if (!active.cancelRequested) {
        const message = error instanceof Error ? error.message : String(error)
        this.publishTranscript(
          active.chatId,
          timestamped({ kind: "result", subtype: "error", isError: true, durationMs: 0, result: message })
        )
        this.publishEvent(active.chatId, {
          type: "turn_failed",
          chatId: active.chatId,
          error: message,
        })
      }
    } finally {
      if (active.cancelRequested && !active.cancelRecorded) {
        this.publishEvent(active.chatId, { type: "turn_cancelled", chatId: active.chatId })
      }
      this.activeTurns.delete(active.chatId)

      // Handle follow-up turn (Codex exit_plan_mode) — close() deferred so
      // the follow-up can reuse the live session (avoids re-spawn cost).
      if (active.postToolFollowUp && !active.cancelRequested) {
        try {
          await this.startTurn({
            ...active.originalCmd,
            content: active.postToolFollowUp.content,
            planMode: active.postToolFollowUp.planMode,
            appendUserPrompt: false,
          })
        } catch (error) {
          active.turn.close()
          const message = error instanceof Error ? error.message : String(error)
          this.publishTranscript(
            active.chatId,
            timestamped({ kind: "result", subtype: "error", isError: true, durationMs: 0, result: message })
          )
          this.publishEvent(active.chatId, { type: "turn_failed", chatId: active.chatId, error: message })
        }
      } else {
        active.turn.close()
      }
    }
  }
}

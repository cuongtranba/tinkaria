import type { AgentProvider, TranscriptEntry, SessionStatus, PendingToolSnapshot } from "./types"

// ── Protocol versioning ──────────────────────────────────────────────

/** Current protocol version emitted by this runner build. */
export const PROTOCOL_VERSION = 1

/** Server-side supported protocol range. Runners outside [min, max] are incompatible. */
export const SUPPORTED_RANGE: { min: number; max: number } = { min: 1, max: 1 }

/** Returns true if v is within the supported protocol range. */
export function isProtocolSupported(v: number): boolean {
  return v >= SUPPORTED_RANGE.min && v <= SUPPORTED_RANGE.max
}

// ── Liveness ─────────────────────────────────────────────────────────

/** Age threshold below which a runner is considered online (ms). */
export const LIVENESS_DEGRADED_MS = 25_000

/** Age threshold at-or-above which a runner is considered offline (ms). */
export const LIVENESS_OFFLINE_MS = 60_000

export type RunnerLivenessState = "online" | "degraded" | "offline"

/**
 * Compute liveness state from last heartbeat timestamp and current time.
 * Pure function — no I/O or side effects.
 */
export function runnerLivenessState(
  lastHeartbeatAt: number | null,
  now: number,
): RunnerLivenessState {
  if (lastHeartbeatAt === null) return "offline"
  const age = now - lastHeartbeatAt
  if (age < LIVENESS_DEGRADED_MS) return "online"
  if (age < LIVENESS_OFFLINE_MS) return "degraded"
  return "offline"
}

// ── Subject helpers ──────────────────────────────────────────────────

const PREFIX = "runtime.runner"

export function runnerHeartbeatSubject(runnerId: string): string {
  return `${PREFIX}.heartbeat.${runnerId}`
}

export function runnerCmdSubject(runnerId: string, cmd: string): string {
  return `${PREFIX}.cmd.${runnerId}.${cmd}`
}

export function runnerEventsSubject(chatId: string): string {
  return `${PREFIX}.evt.${chatId}`
}

// ── Constants ────────────────────────────────────────────────────────

/** KV bucket name for runner registration entries */
export const RUNNER_REGISTRY_BUCKET = "runtime_runner_registry"

/** JetStream stream name for runner turn events */
export const RUNNER_EVENTS_STREAM = "KANNA_RUNNER_EVENTS"

/** Wildcard: all runner events */
export const ALL_RUNNER_EVENTS = `${PREFIX}.evt.>`

// ── Command types ────────────────────────────────────────────────────

export interface StartTurnCommand {
  chatId: string
  provider: AgentProvider
  content: string
  delegatedContext?: string
  isSpawned?: boolean
  model: string
  planMode: boolean
  appendUserPrompt: boolean
  workspaceLocalPath: string
  sessionToken: string | null
  chatTitle: string
  existingMessageCount: number
  workspaceId: string
  /** Resolved binary path from profile/runtime registry */
  binaryPath?: string
  /** Extra env vars from profile */
  extraEnv?: Record<string, string>
}

export interface CancelTurnCommand {
  chatId: string
}

export interface StopChatPtyCommand {
  chatId: string
}

export interface RespondToolCommand {
  chatId: string
  toolUseId: string
  result: string
}

export interface ShutdownCommand {
  reason: string
}

// ── Turn event discriminated union ───────────────────────────────────

interface RunnerTurnEventBase {
  chatId: string
}

interface TranscriptEvent extends RunnerTurnEventBase {
  type: "transcript"
  entry: TranscriptEntry
}

interface SessionTokenEvent extends RunnerTurnEventBase {
  type: "session_token"
  sessionToken: string
}

interface StatusChangeEvent extends RunnerTurnEventBase {
  type: "status_change"
  status: SessionStatus
}

interface PendingToolEvent extends RunnerTurnEventBase {
  type: "pending_tool"
  tool: PendingToolSnapshot | null
}

interface TurnFinishedEvent extends RunnerTurnEventBase {
  type: "turn_finished"
}

interface TurnFailedEvent extends RunnerTurnEventBase {
  type: "turn_failed"
  error: string
}

interface TurnCancelledEvent extends RunnerTurnEventBase {
  type: "turn_cancelled"
}

interface TitleGeneratedEvent extends RunnerTurnEventBase {
  type: "title_generated"
  title: string
}

interface PlanModeSetEvent extends RunnerTurnEventBase {
  type: "plan_mode_set"
  planMode: boolean
}

interface ProviderSetEvent extends RunnerTurnEventBase {
  type: "provider_set"
  provider: AgentProvider
}

interface ContextClearedEvent extends RunnerTurnEventBase {
  type: "context_cleared"
}

export type RunnerTurnEvent =
  | TranscriptEvent
  | SessionTokenEvent
  | StatusChangeEvent
  | PendingToolEvent
  | TurnFinishedEvent
  | TurnFailedEvent
  | TurnCancelledEvent
  | TitleGeneratedEvent
  | PlanModeSetEvent
  | ProviderSetEvent
  | ContextClearedEvent

// ── Registration & heartbeat ─────────────────────────────────────────

export interface RunnerCapabilities {
  providers: AgentProvider[]
}

export interface RunnerRegistration {
  runnerId: string
  pid: number
  startedAt: number
  providers: AgentProvider[]
  /** Protocol version reported by the runner. Missing → treated as incompatible. */
  protocolVersion: number
  /** Optional capability probe (shape only; rich probe added in PR4). */
  capabilities?: RunnerCapabilities
  /**
   * Timestamp (ms since epoch) of the runner's last KV self-write, piggybacked on
   * the heartbeat loop. Used by the discover path (no live heartbeat subscription)
   * to judge liveness via runnerLivenessState. Not written by the server.
   */
  lastSeenAt?: number
}

export interface RunnerHeartbeat {
  runnerId: string
  activeChatIds: string[]
  ts: number
}

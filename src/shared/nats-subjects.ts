import type { SubscriptionTopic } from "./protocol"

const PREFIX = "runtime"
const SNAP_PREFIX = `${PREFIX}.snap.`

/** Map a subscription topic to a KV key (also the subject suffix after `runtime.snap.`) */
export function snapshotKvKey(topic: SubscriptionTopic): string {
  switch (topic.type) {
    case "chat": return `chat.${topic.chatId}`
    case "terminal": return `terminal.${topic.terminalId}`
    case "orchestration": return `orchestration.${topic.chatId}`
    case "workspace": return `workspace.${topic.workspaceId}`
    case "agent-config": return `agent-config.${topic.workspaceId}`
    case "repos": return `repos.${topic.workspaceId}`
    case "workflow-runs": return `workflow-runs.${topic.workspaceId}`
    case "sandbox-status": return `sandbox-status.${topic.workspaceId}`
    default: return topic.type
  }
}

export function snapshotSubject(topic: SubscriptionTopic): string {
  return `${SNAP_PREFIX}${snapshotKvKey(topic)}`
}

export function terminalEventSubject(terminalId: string): string {
  return `${PREFIX}.evt.terminal.${terminalId}`
}

export function chatMessageSubject(chatId: string): string {
  return `${PREFIX}.evt.chat.${chatId}`
}

export function commandSubject(commandType: string): string {
  return `${PREFIX}.cmd.${commandType}`
}

/** Wildcard: all snapshot subjects */
export const ALL_SNAPSHOTS = `${SNAP_PREFIX}>`

/** Wildcard: all terminal events */
export const ALL_TERMINAL_EVENTS = `${PREFIX}.evt.terminal.>`

/** Wildcard: all chat message events */
export const ALL_CHAT_MESSAGE_EVENTS = `${PREFIX}.evt.chat.>`

/** Wildcard: all commands */
export const ALL_COMMANDS = `${PREFIX}.cmd.>`

/** JetStream stream name for chat message events */
export const CHAT_MESSAGE_EVENTS_STREAM_NAME = "KANNA_CHAT_MESSAGE_EVENTS"

/** KV bucket name for snapshot caching */
export const KV_BUCKET = "runtime_snapshots"

/** JetStream stream name for workspace coordination events */
export const WORKSPACE_COORDINATION_EVENTS_STREAM_NAME = "KANNA_WORKSPACE_COORDINATION_EVENTS"

/** Subject for workspace coordination events */
export function workspaceCoordinationEventSubject(workspaceId: string): string {
  return `${PREFIX}.evt.workspace.${workspaceId}`
}

/** Wildcard: all workspace coordination events */
export const ALL_WORKSPACE_COORDINATION_EVENTS = `${PREFIX}.evt.workspace.>`

/** JetStream stream name for workflow run events */
export const WORKFLOW_RUN_EVENTS_STREAM_NAME = "KANNA_WORKFLOW_RUN_EVENTS"

/** Subject for workflow run events */
export function workflowRunEventSubject(workspaceId: string): string {
  return `${PREFIX}.evt.workflow.${workspaceId}`
}

/** Wildcard: all workflow run events */
export const ALL_WORKFLOW_RUN_EVENTS = `${PREFIX}.evt.workflow.>`

/** JetStream stream name for sandbox events */
export const SANDBOX_EVENTS_STREAM_NAME = "KANNA_SANDBOX_EVENTS"

/** Subject for sandbox events */
export function sandboxEventSubject(workspaceId: string): string {
  return `${PREFIX}.evt.sandbox.${workspaceId}`
}

/** Wildcard: all sandbox events */
export const ALL_SANDBOX_EVENTS = `${PREFIX}.evt.sandbox.>`

// === claude-pty subjects ===

export type PtyCommandType =
  | "pty.spawn"
  | "pty.input"
  | "pty.resize"
  | "pty.cancel"
  | "pty.exit"
  | "pty.snapshot"

export function ptyCommandSubject(commandType: PtyCommandType): string {
  return `${PREFIX}.cmd.${commandType}`
}

export function ptyDeltaSubject(): string {
  return `${PREFIX}.evt.pty.delta`
}

export function ptyInstanceEventSubject(chatId: string): string {
  return `${PREFIX}.evt.pty.${chatId}`
}

export const ALL_PTY_COMMANDS = `${PREFIX}.cmd.pty.>`
export const ALL_PTY_EVENTS = `${PREFIX}.evt.pty.>`

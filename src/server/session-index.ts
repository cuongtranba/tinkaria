import type { TranscriptEntry, NormalizedToolCall, AgentProvider } from "../shared/types"
import type { StoreState } from "./events"
import type { SessionRecord, SessionStatus } from "../shared/workspace-types"

interface MutableSessionRecord {
  chatId: string
  workspaceId: string
  intent: string
  status: SessionStatus
  provider: AgentProvider
  branch: string | null
  filesTouched: Set<string>
  commandsRun: string[]
  lastActivity: string
}

function extractFilePath(tool: NormalizedToolCall): string | null {
  switch (tool.toolKind) {
    case "edit_file":
    case "read_file":
    case "write_file":
      return tool.input.filePath
    default:
      return null
  }
}

const MAX_COMMANDS_RUN = 200
const BRANCH_RE = /^git\s+(?:checkout(?:\s+-b)?|switch(?:\s+-c)?)\s+(\S+)/

function extractCommand(tool: NormalizedToolCall): string | null {
  if (tool.toolKind === "bash") return tool.input.command
  return null
}

function extractBranch(tool: NormalizedToolCall): string | null {
  if (tool.toolKind !== "bash") return null
  const match = BRANCH_RE.exec(tool.input.command)
  return match ? match[1] : null
}

export class SessionIndex {
  private readonly sessions = new Map<string, MutableSessionRecord>()

  onMessageAppended(chatId: string, entry: TranscriptEntry, state: StoreState): void {
    const chat = state.chatsById.get(chatId)
    if (!chat) return

    let session = this.sessions.get(chatId)
    if (!session) {
      session = {
        chatId,
        workspaceId: chat.workspaceId,
        intent: "",
        status: "active",
        provider: chat.provider ?? "claude",
        branch: null,
        filesTouched: new Set(),
        commandsRun: [],
        lastActivity: new Date().toISOString(),
      }
      this.sessions.set(chatId, session)
    }

    session.lastActivity = new Date().toISOString()

    if (entry.kind === "user_prompt" && !session.intent) {
      session.intent = entry.content.slice(0, 200)
    }

    if (entry.kind === "tool_call") {
      const filePath = extractFilePath(entry.tool)
      if (filePath) session.filesTouched.add(filePath)

      const branch = extractBranch(entry.tool)
      if (branch) session.branch = branch

      const command = extractCommand(entry.tool)
      if (command) {
        session.commandsRun.push(command)
        if (session.commandsRun.length > MAX_COMMANDS_RUN + 10) {
          session.commandsRun = session.commandsRun.slice(-MAX_COMMANDS_RUN)
        }
      }
    }

    if (entry.kind === "result") {
      session.status = entry.subtype === "success" ? "complete" : entry.subtype === "error" ? "failed" : "idle"
    }
  }

  getSessionsByProject(workspaceId: string): SessionRecord[] {
    const results: SessionRecord[] = []
    for (const session of this.sessions.values()) {
      if (session.workspaceId === workspaceId) {
        results.push(this.toRecord(session))
      }
    }
    return results.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
  }

  getSession(chatId: string): SessionRecord | null {
    const session = this.sessions.get(chatId)
    return session ? this.toRecord(session) : null
  }

  private toRecord(s: MutableSessionRecord): SessionRecord {
    return {
      chatId: s.chatId,
      intent: s.intent,
      status: s.status,
      provider: s.provider,
      branch: s.branch,
      filesTouched: [...s.filesTouched],
      commandsRun: s.commandsRun.slice(),
      lastActivity: s.lastActivity,
    }
  }
}

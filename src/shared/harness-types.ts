import type { AccountInfo, AgentProvider, NormalizedToolCall, TranscriptEntry } from "./types"

export interface HarnessEvent {
  type: "transcript" | "session_token" | "rate_limit"
  entry?: TranscriptEntry
  sessionToken?: string
  rateLimit?: { resetAt: number; tz: string }
}

export interface HarnessToolRequest {
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
}

export interface HarnessTurn {
  provider: AgentProvider
  stream: AsyncIterable<HarnessEvent>
  getAccountInfo?: () => Promise<AccountInfo | null>
  getContextUsage?: () => Promise<{ percentage: number; totalTokens: number; maxTokens: number } | null>
  interrupt: () => Promise<void>
  close: () => void
}

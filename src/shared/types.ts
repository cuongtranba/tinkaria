export const STORE_VERSION = 3 as const
export const PROTOCOL_VERSION = 1 as const

export type AgentProvider = "claude" | "codex"

export interface ProviderModelOption {
  id: string
  label: string
  supportsEffort: boolean
  contextWindowOptions?: readonly ProviderContextWindowOption[]
  description?: string
  supportedEffortLevels?: string[]
}

export interface ProviderEffortOption {
  id: string
  label: string
}

export interface ProviderContextWindowOption {
  id: ClaudeContextWindow
  label: string
}

export const CLAUDE_REASONING_OPTIONS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
] as const satisfies readonly ProviderEffortOption[]

export const CODEX_REASONING_OPTIONS = [
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "XHigh" },
] as const satisfies readonly ProviderEffortOption[]

export type ClaudeReasoningEffort = (typeof CLAUDE_REASONING_OPTIONS)[number]["id"]
export type CodexReasoningEffort = (typeof CODEX_REASONING_OPTIONS)[number]["id"]
export type ClaudeContextWindow = "200k" | "1m"
export type ServiceTier = "fast"

export interface ClaudeModelOptions {
  reasoningEffort: ClaudeReasoningEffort
  contextWindow: ClaudeContextWindow
}

export interface CodexModelOptions {
  reasoningEffort: CodexReasoningEffort
  fastMode: boolean
}

export interface ProviderModelOptionsByProvider {
  claude: ClaudeModelOptions
  codex: CodexModelOptions
}

export type ModelOptions = Partial<{
  [K in AgentProvider]: Partial<ProviderModelOptionsByProvider[K]>
}>

export const DEFAULT_CLAUDE_MODEL_OPTIONS = {
  reasoningEffort: "high",
  contextWindow: "200k",
} as const satisfies ClaudeModelOptions

export const DEFAULT_CODEX_MODEL_OPTIONS = {
  reasoningEffort: "high",
  fastMode: false,
} as const satisfies CodexModelOptions

export function isClaudeReasoningEffort(value: unknown): value is ClaudeReasoningEffort {
  return CLAUDE_REASONING_OPTIONS.some((option) => option.id === value)
}

export function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return CODEX_REASONING_OPTIONS.some((option) => option.id === value)
}

export const CLAUDE_CONTEXT_WINDOW_OPTIONS = [
  { id: "200k", label: "200k" },
  { id: "1m", label: "1M" },
] as const satisfies readonly ProviderContextWindowOption[]

export function isClaudeContextWindow(value: unknown): value is ClaudeContextWindow {
  return CLAUDE_CONTEXT_WINDOW_OPTIONS.some((option) => option.id === value)
}

export interface ProviderCatalogEntry {
  id: AgentProvider
  label: string
  defaultModel: string
  defaultEffort?: string
  supportsPlanMode: boolean
  models: ProviderModelOption[]
  efforts: ProviderEffortOption[]
}

export const PROVIDERS: ProviderCatalogEntry[] = [
  {
    id: "claude",
    label: "Claude",
    defaultModel: "opus",
    defaultEffort: "high",
    supportsPlanMode: true,
    models: [
      { id: "opus", label: "Opus", supportsEffort: true, contextWindowOptions: [...CLAUDE_CONTEXT_WINDOW_OPTIONS] },
      { id: "sonnet", label: "Sonnet", supportsEffort: true, contextWindowOptions: [...CLAUDE_CONTEXT_WINDOW_OPTIONS] },
      { id: "haiku", label: "Haiku", supportsEffort: true },
    ],
    efforts: [...CLAUDE_REASONING_OPTIONS],
  },
  {
    id: "codex",
    label: "Codex",
    defaultModel: "gpt-5.4",
    supportsPlanMode: true,
    models: [
      { id: "gpt-5.4", label: "GPT-5.4", supportsEffort: false },
      { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", supportsEffort: false },
      { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", supportsEffort: false },
    ],
    efforts: [],
  },
]

export function getProviderCatalog(provider: AgentProvider): ProviderCatalogEntry {
  const entry = PROVIDERS.find((candidate) => candidate.id === provider)
  if (!entry) {
    throw new Error(`Unknown provider: ${provider}`)
  }
  return entry
}

export function getClaudeModelOption(modelId: string): ProviderModelOption | undefined {
  return getProviderCatalog("claude").models.find((candidate) => candidate.id === modelId)
}

export function getClaudeContextWindowOptions(modelId: string): readonly ProviderContextWindowOption[] {
  return getClaudeModelOption(modelId)?.contextWindowOptions ?? []
}

export function normalizeClaudeContextWindow(modelId: string, contextWindow?: unknown): ClaudeContextWindow {
  const options = getClaudeContextWindowOptions(modelId)
  if (options.length === 0) return DEFAULT_CLAUDE_MODEL_OPTIONS.contextWindow
  return options.some((option) => option.id === contextWindow)
    ? contextWindow as ClaudeContextWindow
    : DEFAULT_CLAUDE_MODEL_OPTIONS.contextWindow
}

export function resolveClaudeApiModelId(modelId: string, contextWindow?: ClaudeContextWindow): string {
  return contextWindow === "1m" ? `${modelId}[1m]` : modelId
}

export type SessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting_for_user"
  | "failed"
  | "awaiting_agents"

export interface RepoSummary {
  id: string
  workspaceId: string
  label: string | null
  origin: string | null
  localPath: string
  status: "cloned" | "pending" | "error"
  branch: string | null
}

export interface WorkspaceSummary {
  id: string
  localPath: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface SidebarChatRow {
  _id: string
  _creationTime: number
  chatId: string
  title: string
  status: SessionStatus
  unread: boolean
  localPath: string
  provider: AgentProvider | null
  model?: string | null
  lastMessageAt?: number
  hasAutomation: boolean
}

export interface SidebarWorkspaceGroup {
  groupKey: string
  localPath: string
  chats: SidebarChatRow[]
}

export interface SidebarData {
  workspaceGroups: SidebarWorkspaceGroup[]
  independentWorkspaces: IndependentWorkspace[]
}

export interface IndependentWorkspace {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Pinned workspaces sort to the top. Absent = unpinned. */
  pinned?: boolean
  /** Explicit ordering within the pinned/unpinned group; lower renders higher. Absent sorts last. */
  sortOrder?: number
}

/**
 * Canonical ordering for independent workspaces, shared by the persisted
 * snapshot and the client-facing sidebar read-model so both surfaces agree:
 * pinned first, then explicit `sortOrder`, then creation time.
 */
export function compareIndependentWorkspaces(a: IndependentWorkspace, b: IndependentWorkspace): number {
  const aPinned = a.pinned ? 0 : 1
  const bPinned = b.pinned ? 0 : 1
  if (aPinned !== bPinned) return aPinned - bPinned
  const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER
  const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.createdAt - b.createdAt
}

export interface DiscoveredSessionRuntime {
  model?: string
  tokenUsage?: DiscoveredSessionTokenUsage
  usageBuckets?: DiscoveredSessionUsageBucket[]
}

export interface DiscoveredSessionTokenUsage {
  totalTokens: number
  contextWindow?: number
  contextLeft?: number
  estimatedContextPercent?: number
}

export interface DiscoveredSessionUsageBucket {
  label: string
  usedPercent: number
}

export interface LocalWorkspaceSummary {
  localPath: string
  title: string
  source: "saved" | "discovered"
  lastOpenedAt?: number
  chatCount: number
}

export interface LocalWorkspacesSnapshot {
  machine: {
    id: "local"
    displayName: string
  }
  workspaces: LocalWorkspaceSummary[]
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up_to_date"
  | "updating"
  | "restart_pending"
  | "error"

export interface UpdateSnapshot {
  currentVersion: string
  latestVersion: string | null
  status: UpdateStatus
  updateAvailable: boolean
  lastCheckedAt: number | null
  error: string | null
  installAction: "restart" | "reload"
}

export type UpdateInstallErrorCode =
  | "version_not_live_yet"
  | "install_failed"
  | "command_missing"

export interface UpdateInstallResult {
  ok: boolean
  action: "restart" | "reload"
  errorCode: UpdateInstallErrorCode | null
  userTitle: string | null
  userMessage: string | null
}

export interface McpServerInfo {
  name: string
  status: string
  error?: string
}

export interface AccountInfo {
  email?: string
  organization?: string
  subscriptionType?: string
  tokenSource?: string
  apiKeySource?: string
}

export interface AskUserQuestionOption {
  label: string
  description?: string
}

export interface AskUserQuestionItem {
  id?: string
  question: string
  header?: string
  options?: AskUserQuestionOption[]
  multiSelect?: boolean
}

export type AskUserQuestionAnswerMap = Record<string, string[]>

export interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm: string
}

interface TranscriptEntryBase {
  _id: string
  messageId?: string
  createdAt: number
  hidden?: boolean
  debugRaw?: string
}

interface ToolCallBase<TKind extends string, TInput> {
  kind: "tool"
  toolKind: TKind
  toolName: string
  toolId: string
  input: TInput
  rawInput?: Record<string, unknown>
}

export interface AskUserQuestionToolCall
  extends ToolCallBase<"ask_user_question", { questions: AskUserQuestionItem[] }> { }

export interface PresentContentInput {
  title: string
  kind: "markdown" | "code" | "diagram"
  format: string
  source: string
  summary?: string
  collapsed?: boolean
}

export interface PresentContentToolCall
  extends ToolCallBase<"present_content", PresentContentInput> { }

export interface ExitPlanModeToolCall
  extends ToolCallBase<"exit_plan_mode", { plan?: string; summary?: string }> { }

export interface TodoWriteToolCall
  extends ToolCallBase<"todo_write", { todos: TodoItem[] }> { }

export interface SkillToolCall
  extends ToolCallBase<"skill", { skill: string }> { }

export interface GlobToolCall
  extends ToolCallBase<"glob", { pattern: string }> { }

export interface GrepToolCall
  extends ToolCallBase<"grep", { pattern: string; outputMode?: string }> { }

export interface BashToolCall
  extends ToolCallBase<"bash", { command: string; description?: string; timeoutMs?: number; runInBackground?: boolean }> { }

export interface WebSearchToolCall
  extends ToolCallBase<"web_search", { query: string }> { }

export interface ReadFileToolCall
  extends ToolCallBase<"read_file", { filePath: string }> { }

export interface WriteFileToolCall
  extends ToolCallBase<"write_file", { filePath: string; content: string }> { }

export interface EditFileToolCall
  extends ToolCallBase<"edit_file", { filePath: string; oldString: string; newString: string }> { }

export interface SubagentTaskToolCall
  extends ToolCallBase<"subagent_task", { subagentType?: string }> { }

export interface McpGenericToolCall
  extends ToolCallBase<"mcp_generic", { server: string; tool: string; payload: Record<string, unknown> }> { }

export interface UnknownToolCall
  extends ToolCallBase<"unknown_tool", { payload: Record<string, unknown> }> { }

export type NormalizedToolCall =
  | AskUserQuestionToolCall
  | PresentContentToolCall
  | ExitPlanModeToolCall
  | TodoWriteToolCall
  | SkillToolCall
  | GlobToolCall
  | GrepToolCall
  | BashToolCall
  | WebSearchToolCall
  | ReadFileToolCall
  | WriteFileToolCall
  | EditFileToolCall
  | SubagentTaskToolCall
  | McpGenericToolCall
  | UnknownToolCall

export interface ToolResultEntry extends TranscriptEntryBase {
  kind: "tool_result"
  toolId: string
  content: unknown
  isError?: boolean
}

export interface UserPromptEntry extends TranscriptEntryBase {
  kind: "user_prompt"
  content: string
}

export interface SystemInitEntry extends TranscriptEntryBase {
  kind: "system_init"
  provider: AgentProvider
  model: string
  tools: string[]
  agents: string[]
  slashCommands: string[]
  mcpServers: McpServerInfo[]
}

export interface AccountInfoEntry extends TranscriptEntryBase {
  kind: "account_info"
  accountInfo: AccountInfo
}

export interface AssistantTextEntry extends TranscriptEntryBase {
  kind: "assistant_text"
  text: string
}

export interface ToolCallEntry extends TranscriptEntryBase {
  kind: "tool_call"
  tool: NormalizedToolCall
}

export interface ResultEntry extends TranscriptEntryBase {
  kind: "result"
  subtype: "success" | "error" | "cancelled"
  isError: boolean
  durationMs: number
  result: string
  costUsd?: number
}

export interface StatusEntry extends TranscriptEntryBase {
  kind: "status"
  status: string
}

export interface CompactBoundaryEntry extends TranscriptEntryBase {
  kind: "compact_boundary"
}

export interface CompactSummaryEntry extends TranscriptEntryBase {
  kind: "compact_summary"
  summary: string
}

export interface ContextClearedEntry extends TranscriptEntryBase {
  kind: "context_cleared"
}

export interface InterruptedEntry extends TranscriptEntryBase {
  kind: "interrupted"
}

export interface ContextUsageEntry extends TranscriptEntryBase {
  kind: "context_usage"
  contextUsage: {
    percentage: number
    totalTokens: number
    maxTokens: number
  }
}

export type DelegationMode = "blocking" | "background"
export type DelegationResumeMode = "immediate" | "gate"
export type DelegationStatus =
  | "active"
  | "completing"
  | "completed"
  | "failed"
  | "orphaned"
  | "stale"

export interface AgentResultEntry extends TranscriptEntryBase {
  kind: "agent_result"
  delegationId: string
  childChatId: string
  childProvider: AgentProvider
  mode: DelegationMode
  instructionPreview: string
  resumeHint?: string
  resultSummary: string
  resultRef?: string
  isError: boolean
  completedAt: number
}

export type TranscriptEntry =
  | UserPromptEntry
  | SystemInitEntry
  | AccountInfoEntry
  | AssistantTextEntry
  | ToolCallEntry
  | ToolResultEntry
  | ResultEntry
  | StatusEntry
  | CompactBoundaryEntry
  | CompactSummaryEntry
  | ContextClearedEntry
  | InterruptedEntry
  | ContextUsageEntry
  | AgentResultEntry

export interface HydratedToolCallBase<TKind extends string, TInput, TResult> {
  id: string
  messageId?: string
  hidden?: boolean
  kind: "tool"
  toolKind: TKind
  toolName: string
  toolId: string
  input: TInput
  result?: TResult
  rawResult?: unknown
  isError?: boolean
  timestamp: string
}

export interface AskUserQuestionToolResult {
  answers: AskUserQuestionAnswerMap
  discarded?: boolean
}

export interface PresentContentSuccessToolResult {
  accepted: true
  title: string
  kind: "markdown" | "code" | "diagram"
  format: string
  source: string
  summary?: string
  collapsed?: boolean
}

export interface PresentContentValidationIssue {
  path: string[]
  code: string
  message: string
}

export interface PresentContentSchemaValidationError {
  source: "schema_validation"
  schema: "present_content"
  issues: PresentContentValidationIssue[]
}

export interface PresentContentErrorToolResult {
  error: PresentContentSchemaValidationError
}

export type PresentContentToolResult =
  | PresentContentSuccessToolResult
  | PresentContentErrorToolResult

export interface ExitPlanModeToolResult {
  confirmed?: boolean
  clearContext?: boolean
  message?: string
  discarded?: boolean
}

export type HydratedAskUserQuestionToolCall =
  HydratedToolCallBase<"ask_user_question", AskUserQuestionToolCall["input"], AskUserQuestionToolResult>

export type HydratedPresentContentToolCall =
  HydratedToolCallBase<"present_content", PresentContentToolCall["input"], PresentContentToolResult>

export type HydratedExitPlanModeToolCall =
  HydratedToolCallBase<"exit_plan_mode", ExitPlanModeToolCall["input"], ExitPlanModeToolResult>

export type HydratedTodoWriteToolCall =
  HydratedToolCallBase<"todo_write", TodoWriteToolCall["input"], unknown>

export type HydratedSkillToolCall =
  HydratedToolCallBase<"skill", SkillToolCall["input"], unknown>

export type HydratedGlobToolCall =
  HydratedToolCallBase<"glob", GlobToolCall["input"], unknown>

export type HydratedGrepToolCall =
  HydratedToolCallBase<"grep", GrepToolCall["input"], unknown>

export type HydratedBashToolCall =
  HydratedToolCallBase<"bash", BashToolCall["input"], unknown>

export type HydratedWebSearchToolCall =
  HydratedToolCallBase<"web_search", WebSearchToolCall["input"], unknown>

export interface ReadFileToolResult {
  content: string
}

export interface ImageContentBlock {
  mediaType: string
  data: string
}

export interface ReadFileImageResult {
  images: ImageContentBlock[]
  text?: string
}

export function isReadFileImageResult(result: unknown): result is ReadFileImageResult {
  return (
    result !== null
    && typeof result === "object"
    && "images" in result
    && Array.isArray(result.images)
  )
}

export type HydratedReadFileToolCall =
  HydratedToolCallBase<"read_file", ReadFileToolCall["input"], ReadFileToolResult | ReadFileImageResult | string>

export type HydratedWriteFileToolCall =
  HydratedToolCallBase<"write_file", WriteFileToolCall["input"], unknown>

export type HydratedEditFileToolCall =
  HydratedToolCallBase<"edit_file", EditFileToolCall["input"], unknown>

export type HydratedSubagentTaskToolCall =
  HydratedToolCallBase<"subagent_task", SubagentTaskToolCall["input"], unknown>

export type HydratedMcpGenericToolCall =
  HydratedToolCallBase<"mcp_generic", McpGenericToolCall["input"], unknown>

export type HydratedUnknownToolCall =
  HydratedToolCallBase<"unknown_tool", UnknownToolCall["input"], unknown>

export type HydratedToolCall =
  | HydratedAskUserQuestionToolCall
  | HydratedPresentContentToolCall
  | HydratedExitPlanModeToolCall
  | HydratedTodoWriteToolCall
  | HydratedSkillToolCall
  | HydratedGlobToolCall
  | HydratedGrepToolCall
  | HydratedBashToolCall
  | HydratedWebSearchToolCall
  | HydratedReadFileToolCall
  | HydratedWriteFileToolCall
  | HydratedEditFileToolCall
  | HydratedSubagentTaskToolCall
  | HydratedMcpGenericToolCall
  | HydratedUnknownToolCall

export type HydratedTranscriptMessage =
  | ({ kind: "user_prompt"; content: string; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "system_init"; model: string; tools: string[]; agents: string[]; slashCommands: string[]; mcpServers: McpServerInfo[]; provider: AgentProvider; id: string; messageId?: string; timestamp: string; hidden?: boolean; debugRaw?: string })
  | ({ kind: "account_info"; accountInfo: AccountInfo; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "assistant_text"; text: string; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "result"; success: boolean; cancelled?: boolean; result: string; durationMs: number; costUsd?: number; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "status"; status: string; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "compact_boundary"; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "compact_summary"; summary: string; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "context_cleared"; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "interrupted"; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ kind: "unknown"; json: string; id: string; messageId?: string; timestamp: string; hidden?: boolean })
  | ({ id: string; messageId?: string; hidden?: boolean } & HydratedToolCall)

export type TranscriptRenderUnitKind =
  | "user_prompt"
  | "system_init"
  | "account_info"
  | "assistant_response"
  | "wip_block"
  | "tool_group"
  | "standalone_tool"
  | "artifact"
  | "status"
  | "result"
  | "compact_boundary"
  | "compact_summary"
  | "context_cleared"
  | "interrupted"
  | "unknown"

export interface TranscriptRenderUnitBase<TKind extends TranscriptRenderUnitKind> {
  kind: TKind
  id: string
  sourceEntryIds: string[]
}

export type TranscriptSingleRenderUnit =
  | (TranscriptRenderUnitBase<"user_prompt"> & { message: Extract<HydratedTranscriptMessage, { kind: "user_prompt" }> })
  | (TranscriptRenderUnitBase<"system_init"> & { message: Extract<HydratedTranscriptMessage, { kind: "system_init" }> })
  | (TranscriptRenderUnitBase<"account_info"> & { message: Extract<HydratedTranscriptMessage, { kind: "account_info" }> })
  | (TranscriptRenderUnitBase<"assistant_response"> & { message: Extract<HydratedTranscriptMessage, { kind: "assistant_text" }> })
  | (TranscriptRenderUnitBase<"standalone_tool"> & { tool: HydratedToolCall })
  | (TranscriptRenderUnitBase<"artifact"> & { artifact: HydratedPresentContentToolCall })
  | (TranscriptRenderUnitBase<"status"> & { message: Extract<HydratedTranscriptMessage, { kind: "status" }> })
  | (TranscriptRenderUnitBase<"result"> & { message: Extract<HydratedTranscriptMessage, { kind: "result" }> })
  | (TranscriptRenderUnitBase<"compact_boundary"> & { message: Extract<HydratedTranscriptMessage, { kind: "compact_boundary" }> })
  | (TranscriptRenderUnitBase<"compact_summary"> & { message: Extract<HydratedTranscriptMessage, { kind: "compact_summary" }> })
  | (TranscriptRenderUnitBase<"context_cleared"> & { message: Extract<HydratedTranscriptMessage, { kind: "context_cleared" }> })
  | (TranscriptRenderUnitBase<"interrupted"> & { message: Extract<HydratedTranscriptMessage, { kind: "interrupted" }> })
  | (TranscriptRenderUnitBase<"unknown"> & { message: Extract<HydratedTranscriptMessage, { kind: "unknown" }> })

export type TranscriptRenderUnit =
  | TranscriptSingleRenderUnit
  | (TranscriptRenderUnitBase<"wip_block"> & { steps: HydratedTranscriptMessage[] })
  | (TranscriptRenderUnitBase<"tool_group"> & { tools: HydratedToolCall[] })

export interface ChatRuntime {
  chatId: string
  workspaceId: string
  localPath: string
  title: string
  status: SessionStatus
  provider: AgentProvider | null
  model: string | null
  planMode: boolean
  sessionToken: string | null
}

export interface QueuedChatTurnSnapshot {
  chatId: string
  provider?: AgentProvider
  content: string
  model?: string
  modelOptions?: ModelOptions
  effort?: string
  planMode?: boolean
  updatedAt: number
}

export interface ChatSnapshot {
  runtime: ChatRuntime
  messageCount: number
  renderUnits: TranscriptRenderUnit[]
  availableProviders: ProviderCatalogEntry[]
  availableSkills: string[]
  queuedTurn: QueuedChatTurnSnapshot | null
}

export interface CurrentSessionSnapshot {
  runtime: DiscoveredSessionRuntime | null
}

export interface CurrentRepoStatusSnapshot {
  localPath: string
  branch: string | null
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  ahead: number
  behind: number
  isRepo: boolean
}

export interface ChatMessageEvent {
  chatId: string
  entry: TranscriptEntry
}

export interface AppSnapshot {
  sidebar: SidebarData
  chat?: ChatSnapshot | null
}

export interface PendingToolSnapshot {
  toolUseId: string
  toolKind: "ask_user_question" | "exit_plan_mode"
}

export type OrchestrationChildStatus =
  | "spawning"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "closed"

export interface OrchestrationChildNode {
  chatId: string
  externalSessionId?: string
  status: OrchestrationChildStatus
  spawnedAt: number
  lastStatusAt: number
  instruction: string
  children: OrchestrationChildNode[]
}

export interface OrchestrationHierarchySnapshot {
  children: OrchestrationChildNode[]
}

export interface DurableDelegation {
  delegationId: string
  workspaceId: string
  parentChatId: string
  childChatId: string
  childProvider: AgentProvider
  instructionPreview: string
  mode: DelegationMode
  resume: DelegationResumeMode
  status: DelegationStatus
  depth: number
  resumeHint?: string
  resultSummary?: string
  resultRef?: string
  isError?: boolean
  agentResultEntryId?: string
  createdAt: number
  updatedAt: number
}

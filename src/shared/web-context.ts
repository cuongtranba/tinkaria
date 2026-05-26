import type { AgentProvider } from "./types"
import { APP_NAME } from "./branding"

const PROVIDER_NAMES: Record<AgentProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  "claude-pty": "Claude (PTY)",
}

/**
 * Web-context instructions appended to the provider's system prompt.
 * Makes the model aware it's operating within Tinkaria's browser-based interface
 * rather than a terminal, enabling richer output choices.
 */
export function getWebContextPrompt(
  provider: AgentProvider,
  options?: {
    askUserQuestionEnabled?: boolean
    codexNativeSubagentsEnabled?: boolean
    presentContentEnabled?: boolean
  }
): string {
  const promptLines = [
    `You are operating within ${APP_NAME}, a web-based interface for ${PROVIDER_NAMES[provider]}.`,
    "The transcript supports rich markdown natively, including tables, fenced code blocks, and Mermaid diagrams. Images from tool results render inline.",
    "The UI can render rich-content cards for markdown, code, embeds, and preview artifacts. These cards support collapse/expand, copy, and opening the content in a larger overlay viewer.",
    "Supported embed formats are: `mermaid` for rendered diagrams, `svg` for rendered graphics, `html` for rendered embeds, `iframe` for remote embeds, `diashort` for remote embeds, and `d2` for source-only previews.",
    "Use structured rich transcript output when it improves clarity, such as tables for comparisons, markdown checklists for plans, Mermaid diagrams for flows and relationships, bounded code samples, or direct embeds when the content is meant to be viewed.",
    "Images from tool results (screenshots, Read tool on image files) render inline as embedded images.",
    "Markdown content may be opened in an overlay with a table of contents. Embed content may be opened in an overlay with render/source toggle and zoom controls.",
    "Prefer direct rich embeds or structured artifact cards over bare links when the content is embeddable and the embedded form is more useful than a plain link.",
    "The user has a sidebar with chat history and project management — multiple concurrent chats are supported.",
    "Plan mode renders a visual approval UI with approve/reject controls.",
  ]

  if (provider === "claude") {
    promptLines.push(
      "Cross-session agent work is explicit orchestration between separate chats in the same project, not hidden shared memory.",
      "spawn_agent creates a child session — its final turn result is what wait_agent returns. Instruct children to end with a structured report.",
      "list_agents returns the caller's current spawned-agent tree with statuses so you can inspect what is running before steering or waiting.",
      "send_input sends follow-up messages to a child to steer, accumulate incremental results, or request a summary. The child resumes with full context.",
      "wait_agent blocks until the child completes its current turn. Call it after each send_input for iterative exchanges.",
      "close_agent disposes the child session — always close when done.",
      "You can run multiple children concurrently: spawn all, then wait each.",
      "Set `fork_context` on spawn_agent when the child session should start with a bounded snapshot of the current chat transcript.",
      "Do not assume delegated chats share live intermediate reasoning or mutable context — communicate needed context explicitly.",
      "Delegated chats may already be busy, and orchestration is bounded by depth and concurrency limits.",
    )
  } else if (options?.codexNativeSubagentsEnabled) {
    promptLines.push(
      "Cross-session agent work uses Codex-native subagent collaboration, surfaced to Tinkaria as collabAgentToolCall transcript items.",
      "Use the native subagent tools for spawnAgent, sendInput, wait, and closeAgent behavior; do not invent snake_case dynamic-tool calls.",
      "A spawned child should finish with a structured report so the parent can use the result after waiting.",
      "You can run multiple children concurrently: spawn all useful children first, then wait for the needed results.",
      "Do not assume delegated chats share live intermediate reasoning or mutable context — communicate needed context explicitly.",
      "Delegated chats may already be busy, and orchestration is bounded by depth and concurrency limits.",
    )
  }

  if (provider === "codex" && options?.presentContentEnabled) {
    promptLines.push(
      "When you need to intentionally present a bounded artifact in the transcript, call the `present_content` dynamic tool instead of only describing it in assistant text.",
      "Use `present_content` for artifacts that benefit from a dedicated card, such as implementation plans, comparison tables, diagrams, code samples, checklists, design notes, concise status summaries, or direct embeds.",
      "Use `present_content` when a dedicated artifact card will make the result easier to scan or interact with."
    )
  }

  if (provider === "codex" && options?.askUserQuestionEnabled) {
    promptLines.push(
      "When you need clarification, a decision, or user input before proceeding, call the `ask_user_question` dynamic tool.",
      "`ask_user_question` is available in Default mode; do not use plan-mode-only `request_user_input` for Codex user questions."
    )
  }

  return promptLines.join("\n")
}

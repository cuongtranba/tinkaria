import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DEFAULT_CLAUDE_MODEL_OPTIONS, PROVIDERS } from "../../../shared/types"
import {
  CHAT_COMPOSER_PLACEHOLDER_POOL,
  getAwaitingChatComposerPlaceholderText,
  getChatComposerPlaceholderText,
} from "../../lib/quirkyCopy"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { useSkillCompositionStore } from "../../stores/skillCompositionStore"
import { areChatInputPropsEqual, ChatInput, shouldInvokeCancelAction } from "./ChatInput"

describe("ChatInput", () => {
  beforeEach(() => {
    // Pin the composer to a known claude/opus state so the rendered model label
    // is deterministic regardless of cross-file test ordering.
    useChatPreferencesStore.setState({
      composerState: {
        provider: "claude",
        model: "opus",
        modelOptions: { ...DEFAULT_CLAUDE_MODEL_OPTIONS },
        planMode: false,
      },
    })
  })

  afterEach(() => {
    useSkillCompositionStore.setState({
      usageCounts: {},
      ribbonVisible: true,
    })
  })

  test("keeps the skill chips above the composer while placing the Skills toggle beside model selection", () => {
    useSkillCompositionStore.setState({
      usageCounts: {},
      ribbonVisible: true,
    })

    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={async () => "sent"}
        disabled={false}
        canCancel={false}
        connectionStatus="connected"
        activeProvider={null}
        availableProviders={PROVIDERS}
        availableSkills={["c3"]}
      />
    )

    const skillChipIndex = html.indexOf("/c3")
    const placeholderIndex = html.indexOf(getChatComposerPlaceholderText(null))
    const modelIndex = html.indexOf("Opus")
    const skillsToggleIndex = html.indexOf(">Skills<")

    expect(skillChipIndex).toBeGreaterThan(-1)
    expect(placeholderIndex).toBeGreaterThan(-1)
    expect(modelIndex).toBeGreaterThan(placeholderIndex)
    expect(skillsToggleIndex).toBeGreaterThan(-1)
    expect(skillChipIndex).toBeLessThan(placeholderIndex)
    expect(skillsToggleIndex).toBeGreaterThan(modelIndex)
  })

  test("renders reconnect feedback inside the composer area instead of the transcript surface", () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={async () => "sent"}
        disabled={false}
        canCancel={false}
        connectionStatus="connecting"
        activeProvider={null}
        availableProviders={PROVIDERS}
      />
    )

    expect(html).toContain('data-ui-id="chat.composer.area"')
    expect(html).toContain('data-ui-c3="c3-112"')
    expect(html).toContain('data-ui-c3-label="chat-input"')
    expect(html).toContain("border-amber-400/30")
    expect(html).toContain("animate-spin")
    expect(html).not.toContain("transcript.message-list")
  })

  test("ignores callback identity churn when composer inputs are otherwise unchanged", () => {
    expect(areChatInputPropsEqual({
      onSubmit: async () => "sent",
      onCancel: () => {},
      queuedText: "",
      onClearQueuedText: () => {},
      onRestoreQueuedText: () => "",
      disabled: false,
      canCancel: false,
      chatId: "chat-1",
      connectionStatus: "connected",
      activeProvider: "codex",
      runtimeModel: "gpt-5.4",
      availableProviders: PROVIDERS,
      availableSkills: ["c3", "adapt"],
    }, {
      onSubmit: async () => "queued",
      onCancel: () => {},
      queuedText: "",
      onClearQueuedText: () => {},
      onRestoreQueuedText: () => "",
      disabled: false,
      canCancel: false,
      chatId: "chat-1",
      connectionStatus: "connected",
      activeProvider: "codex",
      runtimeModel: "gpt-5.4",
      availableProviders: PROVIDERS.map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({
          ...model,
          contextWindowOptions: model.contextWindowOptions ? [...model.contextWindowOptions] : undefined,
        })),
      })),
      availableSkills: ["c3", "adapt"],
    })).toBe(true)
  })

  test("allows click activation for stop when no pointerdown happened first", () => {
    const pointerTriggeredRef = { current: false }

    expect(shouldInvokeCancelAction("click", pointerTriggeredRef)).toBe(true)
    expect(pointerTriggeredRef.current).toBe(false)
  })

  test("dedupes the synthetic click that follows pointerdown on stop", () => {
    const pointerTriggeredRef = { current: false }

    expect(shouldInvokeCancelAction("pointerdown", pointerTriggeredRef)).toBe(true)
    expect(pointerTriggeredRef.current).toBe(true)
    expect(shouldInvokeCancelAction("click", pointerTriggeredRef)).toBe(false)
    expect(pointerTriggeredRef.current).toBe(false)
  })

  test("uses the curated quirky placeholder pool", () => {
    const placeholder = getChatComposerPlaceholderText("chat-7")

    expect(CHAT_COMPOSER_PLACEHOLDER_POOL).toContain(placeholder)
    expect(getChatComposerPlaceholderText("chat-7")).toBe(placeholder)
  })

  test("marks the composer placeholder as rotating while awaiting", () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={async () => "queued"}
        onCancel={() => {}}
        disabled={false}
        canCancel={true}
        chatId="chat-7"
        connectionStatus="connected"
        activeProvider={null}
        availableProviders={PROVIDERS}
      />
    )

    expect(html).toContain(`placeholder="${getAwaitingChatComposerPlaceholderText("chat-7", 0)}`)
    expect(html).toContain("tinkaria-composer-placeholder-rotating")
  })
})

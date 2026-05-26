import { describe, expect, test, mock, beforeEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PROVIDERS } from "../../../shared/types"

// Control the viewport branch. Default desktop (false) so the original
// static-markup assertions below exercise the inline chip row unchanged.
let mockIsMobile = false
mock.module("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
  getIsMobile: () => mockIsMobile,
  MOBILE_BREAKPOINT_QUERY: "(max-width: 767px)",
}))

import { ChatPreferenceControls } from "./ChatPreferenceControls"

beforeEach(() => {
  mockIsMobile = false
})

describe("ChatPreferenceControls (desktop)", () => {
  test("renders codex-specific controls and can omit plan mode", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="codex"
        model="gpt-5.3-codex"
        modelOptions={{ reasoningEffort: "xhigh", fastMode: true }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        includePlanMode={false}
      />
    )

    expect(html).toContain('data-ui-id="chat.composer.provider.action"')
    expect(html).toContain('data-ui-c3="c3-112"')
    expect(html).toContain('data-ui-c3-label="chat-input"')
    expect(html).toContain("Codex")
    expect(html).toContain("GPT-5.3 Codex")
    expect(html).toContain("XHigh")
    expect(html).toContain("Fast Mode")
    expect(html).not.toContain("Plan Mode")
    // desktop renders the inline row, not the collapsed menu trigger
    expect(html).not.toContain('data-ui-id="chat.composer.menu.action"')
  })

  test("renders claude plan mode controls when enabled", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="claude"
        model="opus"
        modelOptions={{ reasoningEffort: "max", contextWindow: "1m" }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        planMode
        onPlanModeChange={() => {}}
        includePlanMode
      />
    )

    expect(html).toContain("Claude")
    expect(html).toContain("Opus")
    expect(html).toContain("Max")
    expect(html).toContain("1M")
    expect(html).toContain("Plan Mode")
  })

  test("renders the skills toggle directly after the model control when requested", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="codex"
        model="gpt-5.3-codex"
        modelOptions={{ reasoningEffort: "xhigh", fastMode: true }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        showSkillsToggle
        onSkillsToggle={() => {}}
      />
    )

    const modelIndex = html.indexOf("GPT-5.3 Codex")
    const skillsIndex = html.indexOf(">Skills<")
    const reasoningIndex = html.indexOf(">XHigh<")

    expect(modelIndex).toBeGreaterThan(-1)
    expect(skillsIndex).toBeGreaterThan(modelIndex)
    expect(reasoningIndex).toBeGreaterThan(skillsIndex)
  })
})

describe("ChatPreferenceControls (mobile)", () => {
  beforeEach(() => {
    mockIsMobile = true
  })

  test("collapses the inline row into a single model-indicator menu trigger", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="claude"
        model="sonnet"
        modelOptions={{ reasoningEffort: "high", contextWindow: "1m" }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        planMode={false}
        onPlanModeChange={() => {}}
        includePlanMode
      />
    )

    // single collapsed trigger, carrying the model indicator + c3 identity
    expect(html).toContain('data-ui-id="chat.composer.menu.action"')
    expect(html).toContain('data-ui-c3="c3-112"')
    expect(html).toContain("Sonnet")
    // the per-chip row controls are NOT inline anymore (they live inside the
    // closed popover, which is not mounted in static markup)
    expect(html).not.toContain('data-ui-id="chat.composer.reasoning.action"')
    expect(html).not.toContain('data-ui-id="chat.composer.provider.action"')
  })

  test("trigger reflects Plan Mode with the active blue styling", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="claude"
        model="opus"
        modelOptions={{ reasoningEffort: "high", contextWindow: "1m" }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        planMode
        onPlanModeChange={() => {}}
        includePlanMode
      />
    )

    expect(html).toContain('data-ui-id="chat.composer.menu.action"')
    expect(html).toContain("text-blue-400")
  })

  test("trigger reflects Codex Fast Mode with the active emerald styling", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="codex"
        model="gpt-5.3-codex"
        modelOptions={{ reasoningEffort: "xhigh", fastMode: true }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        includePlanMode={false}
      />
    )

    expect(html).toContain('data-ui-id="chat.composer.menu.action"')
    expect(html).toContain("text-emerald-500")
    expect(html).toContain("GPT-5.3 Codex")
  })
})

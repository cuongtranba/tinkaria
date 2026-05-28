import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { HydratedTranscriptMessage, TranscriptRenderUnit } from "../../shared/types"
import { ChatNavbar, getChatNavbarUiIdentityDescriptors } from "../components/chat-ui/ChatNavbar"
import { TooltipProvider } from "../components/ui/tooltip"
import { TextMessage } from "../components/messages/TextMessage"
import type { ProcessedTextMessage } from "../components/messages/types"
import { CHAT_EMPTY_STATE_POOL, getChatEmptyStateText } from "../lib/quirkyCopy"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import {
  ChatEmptyStateBrandMark,
  getAvailableSkillsFromMessages,
  getChatPageUiIdentityDescriptors,
  getChatPageUiIdentities,
  getComposerLiftPx,
  getPendingSessionBootstrapStatusLabel,
  getRequestedSidebarDialog,
  getScrollButtonBottomPx,
  getTranscriptAreaVisibility,
  TranscriptTailBoundary,
  shouldRenderTranscriptCommandError,
  shouldDismissMobileKeyboardOnFirstMessage,
  shouldIgnoreMobileSidebarSwipeStart,
  shouldOpenMobileSidebarFromSwipe,
} from "./ChatPage"

function systemInitMessage(args: {
  slashCommands: string[]
  debugRaw?: string
}): HydratedTranscriptMessage {
  return {
    id: "system-init-1",
    timestamp: "2026-04-01T00:00:00.000Z",
    kind: "system_init",
    provider: "claude",
    model: "claude-opus-4-1",
    tools: [],
    agents: [],
    slashCommands: args.slashCommands,
    mcpServers: [],
    debugRaw: args.debugRaw,
  } as HydratedTranscriptMessage
}

function renderUnit(message: HydratedTranscriptMessage): TranscriptRenderUnit {
  return {
    id: `${message.kind}:${message.id}`,
    kind: message.kind === "assistant_text" ? "assistant_response" : message.kind,
    sourceEntryIds: [message.id],
    message,
  } as TranscriptRenderUnit
}

function interactiveTarget(): EventTarget {
  return {
    closest: () => ({ tagName: "BUTTON" }),
  } as unknown as EventTarget
}

function plainTarget(): EventTarget {
  return {
    closest: () => null,
  } as unknown as EventTarget
}

function createAssistantTextMessage(text: string): ProcessedTextMessage {
  return {
    kind: "assistant_text",
    id: "assistant-1",
    timestamp: "2026-04-02T00:00:00.000Z",
    text,
  }
}

describe("getAvailableSkillsFromMessages", () => {
  test("prefers the narrower skills list from system init debug payload", () => {
    const messages = [
      renderUnit(systemInitMessage({
        slashCommands: ["debug", "review-pr", "release"],
        debugRaw: JSON.stringify({
          slash_commands: ["debug", "review-pr", "release"],
          skills: ["debug", "frontend-design:frontend-design"],
        }),
      })),
    ]

    expect(getAvailableSkillsFromMessages(messages)).toEqual([
      "debug",
      "frontend-design:frontend-design",
    ])
  })

  test("falls back to slashCommands when debug payload has no skills", () => {
    const messages = [
      renderUnit(systemInitMessage({
        slashCommands: ["debug", "review-pr"],
      })),
    ]

    expect(getAvailableSkillsFromMessages(messages)).toEqual(["debug", "review-pr"])
  })

  test("returns an empty list when neither skills nor slashCommands exist", () => {
    const messages = [
      renderUnit(systemInitMessage({
        slashCommands: [],
      })),
    ]

    expect(getAvailableSkillsFromMessages(messages)).toEqual([])
  })

  test("returns an empty list when no messages exist (snapshot fallback precondition)", () => {
    expect(getAvailableSkillsFromMessages([])).toEqual([])
  })
})

describe("getRequestedSidebarDialog", () => {
  test("returns fork and merge requests from route state", () => {
    expect(getRequestedSidebarDialog({ sidebarDialog: "fork" })).toBe("fork")
    expect(getRequestedSidebarDialog({ sidebarDialog: "merge" })).toBe("merge")
  })

  test("ignores invalid route state payloads", () => {
    expect(getRequestedSidebarDialog(null)).toBeNull()
    expect(getRequestedSidebarDialog({})).toBeNull()
    expect(getRequestedSidebarDialog({ sidebarDialog: "rename" })).toBeNull()
    expect(getRequestedSidebarDialog("fork")).toBeNull()
  })
})

describe("getScrollButtonBottomPx", () => {
  test("keeps the base offset when no skills are available", () => {
    expect(getScrollButtonBottomPx({
      hasAvailableSkills: false,
      skillsRibbonVisible: true,
    })).toBe(120)
  })

  test("keeps the base offset when the skills ribbon is collapsed", () => {
    expect(getScrollButtonBottomPx({
      hasAvailableSkills: true,
      skillsRibbonVisible: false,
    })).toBe(120)
  })

  test("lifts the scroll button above the expanded skills ribbon", () => {
    expect(getScrollButtonBottomPx({
      hasAvailableSkills: true,
      skillsRibbonVisible: true,
    })).toBe(172)
  })
})

describe("TranscriptTailBoundary", () => {
  test("renders the bottom sentinel before the trailing spacer when messages exist", () => {
    const html = renderToStaticMarkup(
      createElement(TranscriptTailBoundary, {
        hasMessages: true,
        sentinelRef: { current: null },
      })
    )

    const sentinelIndex = html.indexOf('class="h-px"')
    const spacerIndex = html.indexOf("height:250px")

    expect(sentinelIndex).toBeGreaterThan(-1)
    expect(spacerIndex).toBeGreaterThan(-1)
    expect(sentinelIndex).toBeLessThan(spacerIndex)
  })

  test("does not render the trailing spacer in the empty state", () => {
    const html = renderToStaticMarkup(
      createElement(TranscriptTailBoundary, {
        hasMessages: false,
        sentinelRef: { current: null },
      })
    )

    expect(html).toContain('class="h-px"')
    expect(html).not.toContain("height:250px")
  })
})

describe("getPendingSessionBootstrapStatusLabel", () => {
  test("describes fork compaction as preparing the opening brief", () => {
    expect(getPendingSessionBootstrapStatusLabel({
      pendingSessionBootstrap: {
        chatId: "chat-1",
        kind: "fork",
        phase: "compacting",
        sourceLabels: ["Source"],
        previewTitle: "Fork: Source",
        previewIntent: "Investigate the timeout.",
      },
    } as never)).toBe("Preparing the opening brief from the current chat...")
  })

  test("describes merge startup with merged-session wording", () => {
    expect(getPendingSessionBootstrapStatusLabel({
      pendingSessionBootstrap: {
        chatId: "chat-2",
        kind: "merge",
        phase: "starting",
        sourceLabels: ["A", "B"],
        previewTitle: "Merge: A + B",
        previewIntent: "Combine the verified findings.",
      },
    } as never)).toBe("Starting the merged session...")
  })
})

describe("getComposerLiftPx", () => {
  test("returns zero on non-touch devices even when the visual viewport shrinks", () => {
    expect(getComposerLiftPx({
      layoutViewportHeight: 844,
      visualViewportHeight: 544,
      visualViewportOffsetTop: 0,
      isTouchDevice: false,
    })).toBe(0)
  })

  test("returns the obscured bottom inset when the mobile keyboard shrinks the visual viewport", () => {
    expect(getComposerLiftPx({
      layoutViewportHeight: 844,
      visualViewportHeight: 544,
      visualViewportOffsetTop: 0,
      isTouchDevice: true,
    })).toBe(300)
  })

  test("accounts for a shifted visual viewport when the browser also moves the viewport origin", () => {
    expect(getComposerLiftPx({
      layoutViewportHeight: 844,
      visualViewportHeight: 508,
      visualViewportOffsetTop: 24,
      isTouchDevice: true,
    })).toBe(312)
  })

  test("returns zero when the viewport data is unavailable", () => {
    expect(getComposerLiftPx({
      layoutViewportHeight: 844,
      visualViewportHeight: null,
      visualViewportOffsetTop: 0,
      isTouchDevice: true,
    })).toBe(0)
  })
})

describe("shouldIgnoreMobileSidebarSwipeStart", () => {
  test("ignores gestures that start from interactive controls", () => {
    expect(shouldIgnoreMobileSidebarSwipeStart(interactiveTarget())).toBe(true)
  })

  test("allows gestures that start from non-interactive containers", () => {
    expect(shouldIgnoreMobileSidebarSwipeStart(plainTarget())).toBe(false)
  })
})

describe("shouldOpenMobileSidebarFromSwipe", () => {
  test("opens the mobile sidebar for a right swipe from the left third", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 12,
      startY: 120,
      currentX: 112,
      currentY: 138,
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(true)
  })

  test("rejects swipes that start past the left third of the viewport", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 200,
      startY: 120,
      currentX: 300,
      currentY: 132,
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(false)
  })

  test("rejects mostly vertical drags", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 16,
      startY: 120,
      currentX: 72,
      currentY: 240,
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(false)
  })

  test("rejects gestures that start from interactive controls", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: interactiveTarget(),
    })).toBe(false)
  })

  test("rejects gestures when the sidebar is already open or desktop layout is active", () => {
    const target = plainTarget()

    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: true,
      target,
    })).toBe(false)

    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      viewportWidth: 375,
      isMobileViewport: false,
      isSidebarOpen: false,
      target,
    })).toBe(false)
  })
})

describe("shouldDismissMobileKeyboardOnFirstMessage", () => {
  test("returns true when transitioning from 0 to >0 messages on a touch device", () => {
    expect(shouldDismissMobileKeyboardOnFirstMessage(0, 1, true)).toBe(true)
    expect(shouldDismissMobileKeyboardOnFirstMessage(0, 5, true)).toBe(true)
  })

  test("returns false on non-touch devices", () => {
    expect(shouldDismissMobileKeyboardOnFirstMessage(0, 1, false)).toBe(false)
  })

  test("returns false when previous count was already >0", () => {
    expect(shouldDismissMobileKeyboardOnFirstMessage(1, 2, true)).toBe(false)
    expect(shouldDismissMobileKeyboardOnFirstMessage(5, 6, true)).toBe(false)
  })

  test("returns false when current count is still 0", () => {
    expect(shouldDismissMobileKeyboardOnFirstMessage(0, 0, true)).toBe(false)
  })
})

describe("shouldRenderTranscriptCommandError", () => {
  test("suppresses connection recovery copy in the transcript while the socket is offline", () => {
    expect(shouldRenderTranscriptCommandError({
      commandError: "Can't reach your local Tinkaria server yet. Wait a moment, or start Tinkaria in a terminal on this machine and try again.",
      connectionStatus: "connecting",
    })).toBe(false)

    expect(shouldRenderTranscriptCommandError({
      commandError: "The connection to your local Tinkaria server dropped. Tinkaria will keep trying to reconnect.",
      connectionStatus: "disconnected",
    })).toBe(false)
  })

  test("keeps non-connection errors visible in the transcript", () => {
    expect(shouldRenderTranscriptCommandError({
      commandError: "Unexpected failure",
      connectionStatus: "disconnected",
    })).toBe(true)
  })

  test("keeps connection-related errors visible again once the socket is back", () => {
    expect(shouldRenderTranscriptCommandError({
      commandError: "Can't reach your local Tinkaria server yet. Wait a moment, or start Tinkaria in a terminal on this machine and try again.",
      connectionStatus: "connected",
    })).toBe(true)
  })
})

describe("getChatEmptyStateText", () => {
  test("selects a stable curated empty-state line from the quirky copy pool", () => {
    const first = getChatEmptyStateText("chat-1")
    const second = getChatEmptyStateText("chat-1")

    expect(first).toBe(second)
    expect(CHAT_EMPTY_STATE_POOL).toContain(first)
  })

  test("falls back to a valid default line when no active chat exists", () => {
    expect(CHAT_EMPTY_STATE_POOL).toContain(getChatEmptyStateText(null))
  })
})

describe("getChatPageUiIdentities", () => {
  test("renders the branded empty-state mark instead of the old flower icon", () => {
    const html = renderToStaticMarkup(createElement(ChatEmptyStateBrandMark))

    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).not.toContain("lucide-flower")
    expect(html).toContain("tinkaria-empty-state-flower")
  })

  test("returns the stable first-release chat shell identities", () => {
    expect(getChatPageUiIdentities()).toEqual({
      page: "chat.page",
      transcript: "transcript.message-list",
      composer: "chat.composer",
      navbar: "chat.navbar",
    })
  })

  test("maps each shell identity through the shared ui-id helper", () => {
    const identities = getChatPageUiIdentities()
    const descriptors = getChatPageUiIdentityDescriptors()

    expect(identities).toEqual({
      page: descriptors.page.id,
      transcript: descriptors.transcript.id,
      composer: descriptors.composer.id,
      navbar: descriptors.navbar.id,
    })
    expect(getUiIdentityAttributeProps(descriptors.page)).toEqual({
      "data-ui-id": "chat.page",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
    expect(getUiIdentityAttributeProps(descriptors.transcript)).toEqual({
      "data-ui-id": "transcript.message-list",
      "data-ui-c3": "c3-111",
      "data-ui-c3-label": "messages",
    })
    expect(getUiIdentityAttributeProps(descriptors.composer)).toEqual({
      "data-ui-id": "chat.composer",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
    expect(getUiIdentityAttributeProps(descriptors.navbar)).toEqual({
      "data-ui-id": "chat.navbar",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
  })

  test("renders the assistant response id without the old response card title", () => {
    const html = renderToStaticMarkup(
      createElement(TextMessage, {
        message: createAssistantTextMessage("x".repeat(801)),
      })
    )

    const identityIndex = html.indexOf('data-ui-id="message.assistant.response"')

    expect(identityIndex).toBeGreaterThan(-1)
    expect(html).not.toContain(">Response<")
    expect(html).toContain("group-hover/rich-content:opacity-100")
    expect(html).toContain("group-focus-within/rich-content:opacity-100")
  })

  test("renders the navbar id on the ChatNavbar visible surface", () => {
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(ChatNavbar, {
          sidebarCollapsed: false,
          onOpenSidebar: () => {},
          onCollapseSidebar: () => {},
          onExpandSidebar: () => {},
          onForkSession: () => {},
          onMergeSession: () => {},
        })
      )
    )

    const identityIndex = html.indexOf('data-ui-id="chat.navbar"')
    const forkButtonIndex = html.indexOf('title="Fork session"')

    expect(html).toContain('data-ui-c3="c3-112"')
    expect(html).toContain('data-ui-c3-label="chat-input"')
    expect(identityIndex).toBeGreaterThan(-1)
    expect(forkButtonIndex).toBeGreaterThan(-1)
    expect(identityIndex).toBeLessThan(forkButtonIndex)
  })

  test("renders curated navbar area and action ids on the stable visible controls", () => {
    const descriptors = getChatNavbarUiIdentityDescriptors()
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(ChatNavbar, {
          sidebarCollapsed: false,
          onOpenSidebar: () => {},
          onCollapseSidebar: () => {},
          onExpandSidebar: () => {},
          onForkSession: () => {},
          onMergeSession: () => {},
          localPath: "/tmp/project",
        })
      )
    )

    expect(html).toMatch(new RegExp(`<div[^>]*data-ui-id="${descriptors.area.id}"[^>]*data-ui-c3="c3-112"`))
    expect(html).toMatch(new RegExp(`<button[^>]*data-ui-id="${descriptors.forkSessionAction.id}"[^>]*data-ui-c3="c3-112"`))
  })
})

describe("getTranscriptAreaVisibility", () => {
  test("shows transcript when messages exist", () => {
    expect(getTranscriptAreaVisibility({ messageCount: 5, chatHasKnownMessages: true })).toBe("transcript")
    expect(getTranscriptAreaVisibility({ messageCount: 5, chatHasKnownMessages: false })).toBe("transcript")
  })

  test("shows loading when no messages but chat has known messages", () => {
    expect(getTranscriptAreaVisibility({ messageCount: 0, chatHasKnownMessages: true })).toBe("loading")
  })

  test("shows empty state when no messages and chat has no known messages", () => {
    expect(getTranscriptAreaVisibility({ messageCount: 0, chatHasKnownMessages: false })).toBe("empty")
  })
})

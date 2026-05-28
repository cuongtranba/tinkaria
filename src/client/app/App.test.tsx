import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as AppModule from "./App"
import {
  bindUiIdentityOverlayWindowEvents,
  getAdjacentUnreadChatId,
  getLegacyTinkariaRedirectTarget,
  getAppLayoutUiIdentityDescriptor,
  getNextProvider,
  getUiIdentityOverlayAnchorRect,
  getUiIdentityOverlayCopyDurationMs,
  getUiIdentityOverlayHighlightRect,
  getUiIdentityOverlayPointerHandoffDelayMs,
  shouldDeactivateMobileFabAfterCopyTargetSelection,
  shouldIgnoreUiIdentityOverlayPointerTarget,
  handleMobileTapCapture,
  getMobileTapAnchorRect,
} from "./App"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import { ChatRow } from "../components/chat-ui/sidebar/ChatRow"
import { LocalProjectsSection } from "../components/chat-ui/sidebar/LocalProjectsSection"
import { TooltipProvider } from "../components/ui/tooltip"
import type { SidebarChatRow } from "../../shared/types"

function createOverlayStackElement(args: {
  id: string
  rect: { top: number; left: number; right: number; bottom: number; width: number; height: number }
}): Element {
  return {
    getAttribute(name: string) {
      return name === "data-ui-id" ? args.id : null
    },
    getBoundingClientRect() {
      return args.rect
    },
  } as Element
}

describe("getUiIdentityOverlayCopyDurationMs", () => {
  test("uses a short-lived copied confirmation window", () => {
    expect(getUiIdentityOverlayCopyDurationMs()).toBe(1200)
  })
})

describe("getUiIdentityOverlayPointerHandoffDelayMs", () => {
  test("uses a short handoff delay before clearing the current target", () => {
    expect(getUiIdentityOverlayPointerHandoffDelayMs()).toBe(320)
  })
})

describe("shouldDeactivateMobileFabAfterCopyTargetSelection", () => {
  test("deactivates the mobile FAB after a successful copy target selection", () => {
    expect(shouldDeactivateMobileFabAfterCopyTargetSelection({ mobileActive: true, didCopy: true })).toBe(true)
  })

  test("keeps the mobile FAB state when copy fails or mobile mode is inactive", () => {
    expect(shouldDeactivateMobileFabAfterCopyTargetSelection({ mobileActive: true, didCopy: false })).toBe(false)
    expect(shouldDeactivateMobileFabAfterCopyTargetSelection({ mobileActive: false, didCopy: true })).toBe(false)
  })
})

describe("getNextProvider", () => {
  test("cycles providers in both directions", () => {
    expect(getNextProvider("claude", 1)).toBe("codex")
    expect(getNextProvider("codex", 1)).toBe("claude-pty")
    expect(getNextProvider("claude-pty", 1)).toBe("claude")
    expect(getNextProvider("claude", -1)).toBe("claude-pty")
    expect(getNextProvider("claude-pty", -1)).toBe("codex")
  })
})

describe("getLegacyTinkariaRedirectTarget", () => {
  test("maps legacy settings URLs onto the unified home settings tab", () => {
    expect(getLegacyTinkariaRedirectTarget({ pathname: "/settings" })).toBe("/?tab=settings")
    expect(getLegacyTinkariaRedirectTarget({ pathname: "/settings/providers" })).toBe("/?tab=settings&settingsTab=providers")
    expect(getLegacyTinkariaRedirectTarget({ pathname: "/settings", search: "?tab=profiles", hash: "#profiles" })).toBe("/?tab=settings&settingsTab=profiles#profiles")
  })
})

describe("getAdjacentUnreadChatId", () => {
  const chats: SidebarChatRow[] = [
    {
      _id: "chat-1",
      _creationTime: 1,
      chatId: "chat-1",
      title: "Chat 1",
      status: "idle",
      unread: false,
      localPath: "/tmp/project",
      provider: "claude",
      hasAutomation: false,
    },
    {
      _id: "chat-2",
      _creationTime: 2,
      chatId: "chat-2",
      title: "Chat 2",
      status: "idle",
      unread: true,
      localPath: "/tmp/project",
      provider: "codex",
      hasAutomation: false,
    },
    {
      _id: "chat-3",
      _creationTime: 3,
      chatId: "chat-3",
      title: "Chat 3",
      status: "idle",
      unread: false,
      localPath: "/tmp/project",
      provider: "claude",
      hasAutomation: false,
    },
    {
      _id: "chat-4",
      _creationTime: 4,
      chatId: "chat-4",
      title: "Chat 4",
      status: "idle",
      unread: true,
      localPath: "/tmp/project",
      provider: "claude",
      hasAutomation: false,
    },
  ]

  test("moves to the next unread chat after the active chat", () => {
    expect(getAdjacentUnreadChatId(chats, "chat-1", 1)).toBe("chat-2")
    expect(getAdjacentUnreadChatId(chats, "chat-2", 1)).toBe("chat-4")
  })

  test("wraps unread navigation when moving past the end", () => {
    expect(getAdjacentUnreadChatId(chats, "chat-4", 1)).toBe("chat-2")
  })

  test("moves backwards through unread chats and wraps", () => {
    expect(getAdjacentUnreadChatId(chats, "chat-4", -1)).toBe("chat-2")
    expect(getAdjacentUnreadChatId(chats, "chat-2", -1)).toBe("chat-4")
  })

  test("uses list edges when there is no active chat and returns null when none are unread", () => {
    expect(getAdjacentUnreadChatId(chats, null, 1)).toBe("chat-2")
    expect(getAdjacentUnreadChatId(chats, null, -1)).toBe("chat-4")
    expect(getAdjacentUnreadChatId(chats.map((chat) => ({ ...chat, unread: false })), "chat-1", 1)).toBeNull()
  })
})

describe("getGlobalUiIdentityIds", () => {
  test("returns the stable chat/sidebar/menu surface identities", () => {
    const getGlobalUiIdentityIds = (AppModule as Record<string, unknown>).getGlobalUiIdentityIds

    expect(typeof getGlobalUiIdentityIds).toBe("function")
    expect((getGlobalUiIdentityIds as () => unknown)()).toEqual({
      appLayout: "app.layout",
      sidebar: "chat.sidebar",
      rightSidebar: "chat.right-sidebar",
      chatRow: "sidebar.chat-row",
      projectGroup: "sidebar.project-group",
      chatRowMenu: "sidebar.chat-row.menu",
      projectGroupMenu: "sidebar.project-group.menu",
    })
  })
})

describe("getAppLayoutUiIdentityDescriptor", () => {
  test("tags the app shell with C3 ownership metadata", () => {
    expect(getUiIdentityAttributeProps(getAppLayoutUiIdentityDescriptor())).toEqual({
      "data-ui-id": "app.layout",
      "data-ui-c3": "c3-101",
      "data-ui-c3-label": "app-shell",
    })
  })
})

describe("getUiIdentityOverlayHighlightRect", () => {
  test("prefers the highlighted stack row bounds and falls back to the top stack element", () => {
    const topRect = { top: 12, left: 24, right: 224, bottom: 52, width: 200, height: 40 }
    const ancestorRect = { top: 4, left: 10, right: 260, bottom: 84, width: 250, height: 80 }
    const stack = [
      createOverlayStackElement({ id: "sidebar.chat-row", rect: topRect }),
      createOverlayStackElement({ id: "sidebar.project-group", rect: ancestorRect }),
    ]

    expect(getUiIdentityOverlayHighlightRect(stack, "sidebar.project-group")).toEqual(ancestorRect)
    expect(getUiIdentityOverlayHighlightRect(stack, "sidebar.unknown")).toEqual(topRect)
    expect(getUiIdentityOverlayHighlightRect([], "sidebar.project-group")).toBeNull()
  })
})

describe("getUiIdentityOverlayAnchorRect", () => {
  test("anchors the overlay to the current pointer position", () => {
    expect(getUiIdentityOverlayAnchorRect({ clientX: 320, clientY: 180 })).toEqual({
      top: 180,
      left: 320,
      right: 320,
      bottom: 180,
      width: 0,
      height: 0,
    })
    expect(getUiIdentityOverlayAnchorRect(null)).toBeNull()
  })
})

describe("shouldIgnoreUiIdentityOverlayPointerTarget", () => {
  test("ignores overlay descendants so row hover and copy do not collapse the stack", () => {
    const overlayTarget = {
      closest(selector: string) {
        return selector === '[data-ui-identity-overlay-root="true"]' ? {} : null
      },
    } as unknown as EventTarget

    expect(shouldIgnoreUiIdentityOverlayPointerTarget(overlayTarget)).toBe(true)
    expect(shouldIgnoreUiIdentityOverlayPointerTarget(null)).toBe(false)
  })
})

type FakeWindowListener = (event: Event) => void

function createFakeWindow() {
  const listeners = new Map<string, Set<FakeWindowListener>>()

  return {
    addEventListener(type: string, listener: FakeWindowListener) {
      let handlers = listeners.get(type)
      if (!handlers) {
        handlers = new Set<FakeWindowListener>()
        listeners.set(type, handlers)
      }
      handlers.add(listener)
    },
    removeEventListener(type: string, listener: FakeWindowListener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type: string, event: Event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event)
      }
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

describe("bindUiIdentityOverlayWindowEvents", () => {
  test("resets latched modifiers on blur and ignores overlay-owned pointer targets", () => {
    const fakeWindow = createFakeWindow()
    const modifierSnapshots: Array<{ altKey: boolean; shiftKey: boolean }> = []
    const pointerTargets: unknown[] = []
    const pointerPositions: Array<{ clientX: number; clientY: number }> = []
    let highlightResetCount = 0
    let delayedClearCount = 0
    let cancelledClearCount = 0

    const overlayTarget = {
      closest(selector: string) {
        return selector === '[data-ui-identity-overlay-root="true"]' ? {} : null
      },
      getAttribute() {
        return null
      },
    }
    const surfaceTarget = {
      closest() {
        return null
      },
      getAttribute(name: string) {
        return name === "data-ui-id" ? "chat.page" : null
      },
      parentElement: null,
    }
    const gapTarget = {
      closest() {
        return null
      },
      getAttribute() {
        return null
      },
      parentElement: null,
    }

    const cleanup = bindUiIdentityOverlayWindowEvents(fakeWindow, {
      setModifiers: (modifiers) => {
        modifierSnapshots.push(modifiers)
      },
      setPointerTarget: (target) => {
        if (target) {
          pointerTargets.push(target)
        }
      },
      setPointerPosition: (position) => {
        pointerPositions.push(position)
      },
      resetHighlight: () => {
        highlightResetCount += 1
      },
      cancelPendingPointerClear: () => {
        cancelledClearCount += 1
      },
      clearPointerTargetWithDelay: () => {
        delayedClearCount += 1
      },
    })

    fakeWindow.dispatch("pointermove", { target: surfaceTarget, clientX: 120, clientY: 160 } as unknown as PointerEvent)
    fakeWindow.dispatch("keydown", { altKey: true, shiftKey: true } as unknown as KeyboardEvent)
    fakeWindow.dispatch("pointermove", { target: overlayTarget, clientX: 90, clientY: 100 } as unknown as PointerEvent)
    fakeWindow.dispatch("pointermove", { target: gapTarget, clientX: 140, clientY: 175 } as unknown as PointerEvent)
    fakeWindow.dispatch("blur", new Event("blur"))

    expect(modifierSnapshots).toEqual([
      { altKey: true, shiftKey: true },
      { altKey: false, shiftKey: false },
    ])
    expect(pointerTargets).toEqual([surfaceTarget])
    expect(pointerPositions).toEqual([
      { clientX: 120, clientY: 160 },
    ])
    expect(highlightResetCount).toBe(1)
    expect(delayedClearCount).toBe(0)
    expect(cancelledClearCount).toBe(2)

    cleanup()

    expect(fakeWindow.listenerCount("keydown")).toBe(0)
    expect(fakeWindow.listenerCount("keyup")).toBe(0)
    expect(fakeWindow.listenerCount("pointermove")).toBe(0)
    expect(fakeWindow.listenerCount("blur")).toBe(0)
  })

  test("latches the current target for one Alt+Shift hold and only refreshes after release", () => {
    const fakeWindow = createFakeWindow()
    const modifierSnapshots: Array<{ altKey: boolean; shiftKey: boolean }> = []
    const pointerTargets: unknown[] = []
    const pointerPositions: Array<{ clientX: number; clientY: number }> = []
    let highlightResetCount = 0
    let delayedClearCount = 0
    let cancelledClearCount = 0

    const firstSurfaceTarget = {
      closest() {
        return null
      },
      getAttribute(name: string) {
        return name === "data-ui-id" ? "chat.page" : null
      },
      parentElement: null,
    }
    const secondSurfaceTarget = {
      closest() {
        return null
      },
      getAttribute(name: string) {
        return name === "data-ui-id" ? "chat.right-sidebar" : null
      },
      parentElement: null,
    }

    const cleanup = bindUiIdentityOverlayWindowEvents(fakeWindow, {
      setModifiers: (modifiers) => {
        modifierSnapshots.push(modifiers)
      },
      setPointerTarget: (target) => {
        if (target) {
          pointerTargets.push(target)
        }
      },
      setPointerPosition: (position) => {
        pointerPositions.push(position)
      },
      resetHighlight: () => {
        highlightResetCount += 1
      },
      cancelPendingPointerClear: () => {
        cancelledClearCount += 1
      },
      clearPointerTargetWithDelay: () => {
        delayedClearCount += 1
      },
    })

    fakeWindow.dispatch(
      "pointermove",
      { target: firstSurfaceTarget, clientX: 120, clientY: 160 } as unknown as PointerEvent
    )
    fakeWindow.dispatch("keydown", { altKey: true, shiftKey: true } as unknown as KeyboardEvent)
    fakeWindow.dispatch(
      "pointermove",
      { target: secondSurfaceTarget, clientX: 260, clientY: 320 } as unknown as PointerEvent
    )
    fakeWindow.dispatch("keyup", { altKey: false, shiftKey: false } as unknown as KeyboardEvent)
    fakeWindow.dispatch(
      "pointermove",
      { target: secondSurfaceTarget, clientX: 260, clientY: 320 } as unknown as PointerEvent
    )

    expect(modifierSnapshots).toEqual([
      { altKey: true, shiftKey: true },
      { altKey: false, shiftKey: false },
    ])
    expect(pointerTargets).toEqual([firstSurfaceTarget, secondSurfaceTarget])
    expect(pointerPositions).toEqual([
      { clientX: 120, clientY: 160 },
      { clientX: 260, clientY: 320 },
    ])
    expect(highlightResetCount).toBe(2)
    expect(delayedClearCount).toBe(0)
    expect(cancelledClearCount).toBe(2)

    cleanup()
  })
})

describe("sidebar ui identity coverage", () => {
  test("renders curated sidebar ids on chat rows and project groups", () => {
    const chatRowHtml = renderToStaticMarkup(
      createElement(ChatRow, {
        chat: {
          _id: "sidebar-chat-1",
          _creationTime: Date.parse("2026-04-02T00:00:00.000Z"),
          chatId: "chat-1",
          title: "Test Chat",
          status: "idle",
          localPath: "/tmp/project-1",
          provider: null,
          unread: false,
          lastMessageAt: Date.parse("2026-04-02T00:00:00.000Z"),
          hasAutomation: false,
        },
        activeChatId: null,
        nowMs: Date.parse("2026-04-02T01:00:00.000Z"),
        onSelectChat: () => {},
        onDeleteChat: () => {},
        onRenameChat: () => {},
      })
    )
    const localProjectsHtml = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(LocalProjectsSection, {
          workspaceGroups: [
            {
              groupKey: "project-1",
              localPath: "/tmp/project-1",
              chats: [],
            },
          ],
          expandedGroups: new Set<string>(),
          onToggleExpandedGroup: () => {},
          renderChatRow: () => null,
          chatsPerProject: 3,
          onRemoveProject: () => {},
        })
      )
    )

    expect(chatRowHtml).toContain('data-ui-id="sidebar.chat-row"')
    expect(chatRowHtml).toContain('data-ui-c3="c3-113"')
    expect(localProjectsHtml).toContain('data-ui-id="sidebar.project-group"')
    expect(localProjectsHtml).toContain('data-ui-c3="c3-113"')
    expect(localProjectsHtml).not.toContain("cursor-grab")
  })
})

describe("handleMobileTapCapture", () => {
  test("intercepts taps on tagged surfaces and returns target + position", () => {
    const taggedElement = {
      closest: (selector: string) => {
        if (selector === '[data-ui-identity-overlay-root="true"]') return null
        if (selector === '[data-ui-identity-fab="true"]') return null
        if (selector === "[data-ui-id]") return taggedElement
        return null
      },
      getAttribute: (name: string) => (name === "data-ui-id" ? "chat.page" : null),
      parentElement: null,
    } as unknown as Element

    let defaultPrevented = false
    let propagationStopped = false
    const event = {
      target: taggedElement,
      clientX: 200,
      clientY: 300,
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => { propagationStopped = true },
    } as unknown as MouseEvent

    const result = handleMobileTapCapture(event)

    expect(defaultPrevented).toBe(true)
    expect(propagationStopped).toBe(true)
    expect(result).toEqual({
      target: taggedElement,
      clientX: 200,
      clientY: 300,
    })
  })

  test("passes through taps on untagged surfaces", () => {
    const untaggedElement = {
      closest: () => null,
      getAttribute: () => null,
    }

    let defaultPrevented = false
    const event = {
      target: untaggedElement,
      clientX: 200,
      clientY: 300,
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => {},
    } as unknown as MouseEvent

    const result = handleMobileTapCapture(event)

    expect(defaultPrevented).toBe(false)
    expect(result).toBeNull()
  })

  test("passes through taps on overlay panel descendants", () => {
    const overlayChild = {
      closest: (selector: string) =>
        selector === '[data-ui-identity-overlay-root="true"]' ? {} : null,
    }

    let defaultPrevented = false
    const event = {
      target: overlayChild,
      clientX: 100,
      clientY: 100,
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => {},
    } as unknown as MouseEvent

    const result = handleMobileTapCapture(event)
    expect(defaultPrevented).toBe(false)
    expect(result).toBeNull()
  })

  test("passes through taps on FAB descendants", () => {
    const fabChild = {
      closest: (selector: string) =>
        selector === '[data-ui-identity-fab="true"]' ? {} : null,
    }

    let defaultPrevented = false
    const event = {
      target: fabChild,
      clientX: 100,
      clientY: 100,
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => {},
    } as unknown as MouseEvent

    const result = handleMobileTapCapture(event)
    expect(defaultPrevented).toBe(false)
    expect(result).toBeNull()
  })
})

describe("getMobileTapAnchorRect", () => {
  test("converts click coordinates to an anchor rect", () => {
    expect(getMobileTapAnchorRect(200, 300)).toEqual({
      top: 300,
      left: 200,
      right: 200,
      bottom: 300,
      width: 0,
      height: 0,
    })
  })
})

describe("mobile tap cycle end-to-end", () => {
  test("handleMobileTapCapture builds the correct result for a nested element", () => {
    const grandparent = {
      getAttribute: (name: string) => (name === "data-ui-id" ? "sidebar.project-group" : null),
      closest: (selector: string) => {
        if (selector === "[data-ui-id]") return grandparent
        return null
      },
      parentElement: null,
    } as unknown as Element
    const parent = {
      getAttribute: (name: string) => (name === "data-ui-id" ? "sidebar.chat-row" : null),
      closest: (selector: string) => {
        if (selector === "[data-ui-id]") return parent
        if (selector === '[data-ui-identity-overlay-root="true"]') return null
        if (selector === '[data-ui-identity-fab="true"]') return null
        return null
      },
      parentElement: grandparent,
    } as unknown as Element
    const leaf = {
      getAttribute: () => null,
      closest: (selector: string) => {
        if (selector === "[data-ui-id]") return parent
        if (selector === '[data-ui-identity-overlay-root="true"]') return null
        if (selector === '[data-ui-identity-fab="true"]') return null
        return null
      },
      parentElement: parent,
    } as unknown as Element

    let defaultPrevented = false
    let propagationStopped = false
    const event = {
      target: leaf,
      clientX: 150,
      clientY: 400,
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => { propagationStopped = true },
    } as unknown as MouseEvent

    const result = handleMobileTapCapture(event)

    expect(defaultPrevented).toBe(true)
    expect(propagationStopped).toBe(true)
    expect(result).not.toBeNull()
    expect(result!.target).toBe(parent)
    expect(result!.clientX).toBe(150)
    expect(result!.clientY).toBe(400)

    const anchor = getMobileTapAnchorRect(result!.clientX, result!.clientY)
    expect(anchor.top).toBe(400)
    expect(anchor.left).toBe(150)
  })
})

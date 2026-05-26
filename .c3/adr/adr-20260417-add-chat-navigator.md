---
id: adr-20260417-add-chat-navigator
c3-seal: 1f23cb3add9e455baad1343c321da111d76026486de3d3c742c11475cd5c8e2b
title: add-chat-navigator
type: adr
goal: Replace the single-purpose ArrowDown scroll-to-bottom button with a waypoint-based Chat Navigator pill that steps between user prompts (`← [n/N label] →`).
status: proposed
date: "2026-04-17"
---

## Goal

Replace the single-purpose ArrowDown scroll-to-bottom button with a waypoint-based Chat Navigator pill that steps between user prompts (`← [n/N label] →`).

## Context

The existing scroll-to-bottom arrow only jumps to the very end of the chat — useless mid-conversation when reading results and wanting to step between questions. The virtualizer (`@tanstack/react-virtual`) means DOM-based position queries (`offsetTop`, `getElementById`) are broken for off-screen rows. Navigation must use the virtualizer API exclusively.

Affected topology: c3-110 (chat — ChatPage wiring, navigation hook, UI component), c3-119 (transcript-renderer — waypoint extraction from render units, `getUnitDomId` extraction).

## Decision

Split the feature into three layers:

1. **Pure waypoint logic** (`chatWaypoints.ts`) — `extractWaypoints()`, `findCurrentWaypointIndex()`, `truncateLabel()`, `getUnitDomId()`. All pure functions, no React, no DOM. Belongs to c3-119 since it operates on `TranscriptRenderUnit[]` and `getUnitDomId` was extracted from `ChatTranscript.tsx`.
2. **React hook** (`useChatNavigator.ts`) — consumes waypoints, attaches scroll listener with rAF throttle, uses `virtualizer.measurementsCache[].start` for position tracking and `scrollToIndex()` for navigation. Guards programmatic scrolls via `beginProgrammaticScroll()`/`endProgrammaticScroll()`. Belongs to c3-110 (chat-level orchestration).
3. **UI pill** (`ChatNavigator.tsx`) — `← [n/N label] →` with chevron buttons, fallback ArrowDown when zero waypoints. Belongs to c3-110.
Also mapped previously-unmapped scroll infrastructure (`scrollFollowStore.ts`, `useScrollSync.ts`) to c3-110.

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| New: chatWaypoints.ts | Pure waypoint extraction + getUnitDomId (extracted from ChatTranscript.tsx) → c3-119 codemap | commit 039ace5 |
| New: chatWaypoints.test.ts | 17 unit tests for pure logic → c3-119 codemap | commit 039ace5 |
| New: useChatNavigator.ts | React hook using virtualizer API → c3-110 codemap | commit 039ace5 |
| New: ChatNavigator.tsx | Navigator pill UI → c3-110 codemap | commit 039ace5 |
| Modified: ChatTranscript.tsx | Added virtualizerRef prop, removed inline getUnitDomId | commit 039ace5 |
| Modified: ChatPage.tsx | Wired ChatNavigator replacing ArrowDown button | commit 039ace5 |
| Modified: useAppState.ts | Exposed beginProgrammaticScroll/endProgrammaticScroll | commit 039ace5 |
| Modified: useScrollSync.ts | Exposed guards in return value → c3-110 codemap (was unmapped) | commit 039ace5 |
| Modified: scrollFollowStore.ts | Exported SMOOTH_SCROLL_TIMEOUT_MS → c3-110 codemap (was unmapped) | commit 039ace5 |
| C3: c3-119 codemap | Add chatWaypoints.ts, chatWaypoints.test.ts | This ADR |
| C3: c3-110 codemap | Add ChatNavigator.tsx, useChatNavigator.ts, scrollFollowStore.ts, useScrollSync.ts | This ADR |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A | No C3 CLI, validator, command, hint, help, schema, template, or test changes needed | Feature is application-level, no C3 tooling affected |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| bun test chatWaypoints | 17 unit tests covering extractWaypoints, truncateLabel, findCurrentWaypointIndex | bun test src/client/app/chatWaypoints.test.ts |
| TypeScript strict mode | All new files compile under strict TS via bunx @typescript/native-preview | bunx @typescript/native-preview --noEmit -p tsconfig.json |
| c3x check | Codemap coverage includes new files after update | c3x check |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| DOM-based position tracking (offsetTop/getElementById) | Virtualizer uses position:absolute + transform:translateY — offsetTop is always ~0, and off-screen elements don't exist in DOM |
| Separate c3 component for navigator | Too small for own component — 3 files, tightly coupled to chat scroll infrastructure |
| Keep ArrowDown for zero-waypoint case and add navigator separately | Unified component with fallback is simpler — one slot in ChatPage |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| measurementsCache stale for unmeasured items | findCurrentWaypointIndex skips null offsets | Test: "skips waypoints with unmeasured items" |
| Programmatic scroll triggers detach | Wrapped in beginProgrammaticScroll/endProgrammaticScroll guards | Manual test: → at last Q snaps to bottom without re-detaching |
| Zero waypoints (empty chat, system-only) | Fallback ArrowDown button preserves original behavior | Visual: empty chat shows ArrowDown |

## Verification

| Check | Result |
| --- | --- |
| bun test src/client/app/chatWaypoints.test.ts | 17 pass |
| bunx @typescript/native-preview --noEmit -p tsconfig.json | No new errors (pre-existing only) |
| c3x check | Pass after codemap updates |
| Manual: pill shows truncated prompt, ← → navigate, edge cases work | Verified in prior session |

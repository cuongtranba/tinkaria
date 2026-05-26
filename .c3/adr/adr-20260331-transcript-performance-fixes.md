---
id: adr-20260331-transcript-performance-fixes
c3-seal: da1fb31d22c318d30b04426264e1dce8887f9ae0bd4574eb90efebbb525bd91a
title: transcript-performance-fixes
type: adr
goal: Five performance optimizations for the chat transcript rendering pipeline, fixing O(n) reprocessing, naive O(m×n) diff, no virtualization, no React.memo, and full initial fetch.
status: accepted
date: "2026-03-31"
---

## Goal

Five performance optimizations for the chat transcript rendering pipeline, fixing O(n) reprocessing, naive O(m×n) diff, no virtualization, no React.memo, and full initial fetch.

### Work Breakdown

| # | Fix | Files | Impact |
| --- | --- | --- | --- |
| A | Incremental hydration — split processTranscriptMessages into hydrateEntry + append | src/client/lib/parseTranscript.ts, src/client/app/useKannaState.ts | O(1) per message instead of O(n) |
| B | Replace custom LCS with jsdiff Myers algorithm | src/client/components/messages/FileContentView.tsx | O(n+d) vs O(m×n) for diff |
| C | React.memo on all message components | src/client/components/messages/*.tsx, src/client/app/KannaTranscript.tsx | Skip re-render of unchanged messages |
| D | Virtual transcript with @tanstack/react-virtual | src/client/app/KannaTranscript.tsx, src/client/app/ChatPage.tsx | Only mount visible messages in DOM |
| E | Paginated initial load | src/server/event-store.ts, src/server/nats-responders.ts, src/client/app/useKannaState.ts | Instant initial render, lazy older messages |

### Affected Entities

- c3-110 (chat) — useKannaState, KannaTranscript
- c3-111 (messages) — FileContentView, all message components
- c3-201 (event-store) — paginated getMessages
- c3-205 (nats-transport) — responder update
- c3-204 (shared-types) — no type changes needed

### Risks

- Fix D (virtualization) changes scroll behavior — auto-follow and sticky scroll must be preserved
- Fix A changes the message hydration contract — tool_result linking to pending tool_calls must still work
- Fix E (pagination) — buffer merging with live events needs careful ordering

### Status

Accepted. Implementing all five fixes.

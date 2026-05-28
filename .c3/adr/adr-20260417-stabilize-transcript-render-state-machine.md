---
id: adr-20260417-stabilize-transcript-render-state-machine
c3-seal: 2997ca8a7423ae9042a7a4625d8afda97b9dd50dfc1fe1d589e04b72392c22f6
title: stabilize-transcript-render-state-machine
type: adr
goal: Define and accept the transcript render state-machine plan before implementation so live rendering has one visual writer, an exact projection freshness key, stable render-unit identity, and RED-GREEN-TDD gates for the flashing regression.
status: accepted
date: "2026-04-17"
---

## Goal

Define and accept the transcript render state-machine plan before implementation so live rendering has one visual writer, an exact projection freshness key, stable render-unit identity, and RED-GREEN-TDD gates for the flashing regression.

Decision:

- Status is accepted, not implemented. This ADR governs the plan and reference; implementation is a follow-up code change.
- The authoritative freshness key is `TranscriptProjectionKey = { chatId, entryCount, lastEntryId, contentHash }`.
- `entryCount` is the monotonic cursor because render-relevant transcript facts are append-only. `contentHash` is the equality guard for equivalent projections. `lastEntryId` is debug/isolation evidence, not an ordering substitute.
- Store updates may touch non-render metadata only. If render-visible transcript content must be corrected, append a new transcript entry. If future requirements need in-place render-visible mutation, change the ref first to introduce server-owned `projectionSeq`/revision.
- Same-chat projections apply only when `entryCount` increases. Same `entryCount` plus same `contentHash` is ignored. Same `entryCount` plus different `contentHash` is non-monotonic and must not replace visible units during a live turn; it is accepted only during explicit chat selection/hydration reset and should be logged.
- Raw transcript events are stale signals only. They may coalesce and request a projection refresh, but they must never write visible render units.
- `ChatTranscript` is a render-unit renderer only. It must not own transcript grouping, assistant answer detection, tool-boundary folding, hydration fetches, or visibility decisions.
- Live fade loops are forbidden: `.animate-narration-guard` or successor animation must not re-hide already-visible assistant content on each projection.
Implementation plan:

1. RED: add projection shape-stability tests for pure assistant text, tool-assisted turns, dedicated tools, status/result boundaries, and loading-to-idle transitions.
2. RED: add projection-key tests for append-only entryCount, same-count/same-hash replay, same-count/different-hash rejection, and non-render metadata updates not changing projection keys.
3. RED: add delivery reducer tests for raw-event no-op visibility, refresh coalescing, stale snapshot/reply ignore, same-hash ignore, same-count/different-hash live rejection, projection failure retaining visible units, and chat-switch isolation.
4. GREEN: introduce shared `TranscriptProjectionKey`/metadata on chat snapshots and `chat.getRenderUnits` replies, deriving it from the ordered source entry window.
5. GREEN: implement the pure delivery reducer/state machine and move visible render-unit ownership into it.
6. GREEN: make `useTranscriptLifecycle` dispatch events into the machine and remove direct raw-event visible hydration.
7. GREEN: keep `ChatTranscript` as units-only rendering, removing renderer-owned grouping/visibility logic from the component path.
8. GREEN: remove or constrain `.animate-narration-guard` so live projections cannot replay fade-in on stable units.
9. Verify: focused Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, C3 check, `git diff --check`, and agent-browser smoke that proves a live turn has no repeated remount/fade flash and no console/page errors.
Parent Delta:

- c3-1 updated so transcript lifecycle owns projection delivery state and transcript renderer owns units-only rendering.
- c3-2 updated so shared types carry projection-key shape, read models derive it, NATS preserves it, and transcript runtime owns append-only render facts.
- c3-118 reconciled so raw transcript events are projection-stale signals, not visible hydration.
- c3-119 reconciled so grouping/tool-boundary behavior belongs to the projection fold, not React rendering.
- c3-204 reconciled so `TranscriptProjectionKey` is the shared wire type for snapshots and render-window replies.
- c3-205 reconciled so transport preserves projection key and request tokens without inventing freshness.
- c3-214 reconciled so read models derive render units and projection keys from the same ordered source window.
- c3-226 reconciled so render-relevant transcript facts are append-only and store updates are non-render metadata only.

---
id: ref-transcript-render-state-machine
c3-seal: 817ecf4381adbf6b74143e8637a1f5b71d74f37c4ce7b2e2be8ee5f1be489a37
title: transcript-render-state-machine
type: ref
goal: Make transcript rendering visually stable, replayable, and dead easy to test by separating immutable transcript facts, deterministic render-unit projection, and client delivery state. React renders only the delivery machine's visible render units; raw transcript events never directly mutate visible units.
---

## Goal

Make transcript rendering visually stable, replayable, and dead easy to test by separating immutable transcript facts, deterministic render-unit projection, and client delivery state. React renders only the delivery machine's visible render units; raw transcript events never directly mutate visible units.

## Choice

Use two pure contracts and one exact freshness key, backed by append-only render facts:

1. Projection fold: ordered `TranscriptEntry[]` plus explicit projection options becomes `TranscriptRenderUnit[]` with stable ids and no client render guessing.
2. Projection identity: every snapshot/render-window response carries `TranscriptProjectionKey = { chatId, entryCount, lastEntryId, contentHash }`.
3. Delivery state machine: NATS snapshots, raw transcript events, recovery fetches, and chat route changes become one visible transcript state with monotonic apply/ignore rules.
Hard data rule:

- Render-relevant transcript facts are append-only. Text, tool-call input, tool-result output, status/result payload, hidden/render kind, source ids, and ordering cannot be updated in place after they can affect projection.
- Store updates may touch non-render metadata only, such as active status maps, title/provider/session metadata, queue bookkeeping, or operational indexes.
- If render-visible content must be corrected, append a new transcript entry that supersedes or corrects the prior fact; do not mutate the prior render-relevant entry.
- If future requirements need in-place render-visible mutation, this ref must change first by replacing `entryCount` as the monotonic cursor with a server-owned `projectionSeq`/revision.
Freshness rules:
- `chatId` scopes ownership. A projection for any other chat is ignored unless it is part of the current `chat.selected` reset.
- `entryCount` is the only monotonic ordering cursor under the append-only render-fact rule. Later render-visible progress must increase the count.
- `contentHash` is the equality guard for replayed/equivalent projections. Same `entryCount` and same `contentHash` is ignored.
- Same `entryCount` and different `contentHash` is non-monotonic during a live turn. It must not replace visible units because that is the exact loading/idle flip that causes flashing. It may apply only inside explicit chat selection, hydration reset, or recovery invalidation, and should produce a debug log.
- `lastEntryId` travels with the key for debug/isolation evidence and request matching; it is not used as an ordering substitute.
The delivery machine is the only visual writer. `ChatTranscript` must stay a dumb renderer of `TranscriptRenderUnit[]` (or the ready/awaiting state's `units`) and must not group, hide, fetch, hydrate, or reinterpret transcript facts.

## Why

The render-unit read model made transcript output deterministic, but flashing can still happen if the client applies multiple projections for one turn or if the same transcript entries change unit shape between loading and idle phases. A state machine makes those failure modes explicit and testable:

- raw transcript events only mark projection stale or increment pending counters;
- snapshots/render-window replies apply only when the projection key is newer for the active chat;
- same projection key is ignored;
- same count with a different hash is rejected during live delivery instead of remounting visible units;
- loading/idle can change adornment, not semantic unit identity for the same entry window;
- stale chat snapshots cannot leak into a new route;
- animations cannot repeatedly re-hide already-visible assistant content.

## How

Required delivery states:

- `empty`: no active chat or cleared route.
- `hydrating`: chat selected; previous visible units may be retained only when they belong to the same chat and the same cache key.
- `ready`: visible projection is current for `{chatId, entryCount, lastEntryId, contentHash}`.
- `awaiting_projection`: one or more raw transcript events arrived; visible units remain the last ready projection until a newer snapshot or render-window reply applies.
Required events:
- `chat.selected(chatId)` resets ownership, starts a new request token, and may restore same-chat cached units.
- `chat.cleared` returns to `empty`.
- `snapshot.received(chatId, projectionKey, renderUnits)` applies only when it belongs to the active chat and passes freshness.
- `transcript.event(chatId, entryId)` never changes visible units; it coalesces pending work and can request one projection refresh.
- `renderWindow.requested(chatId, requestToken)` records the only current projection request.
- `renderWindow.received(chatId, requestToken, projectionKey, renderUnits)` applies only when the request is current and passes freshness.
- `projection.failed(token)` clears only pending projection state; it must not blank visible units during a live turn.
Projection key derivation:
- `entryCount`: total ordered transcript entries included in the server-side source window before projection. Valid as monotonic cursor only because render-relevant transcript facts are append-only.
- `lastEntryId`: `_id` of the last source entry in that ordered window, or `null` for an empty window.
- `contentHash`: deterministic hash of a named schema version plus the ordered source entry ids and the projected render unit ids/kinds/source ids. It is stable across equivalent projections and detects same-count projection drift. Do not include volatile runtime fields, timestamps outside source entries, request tokens, or loading/idle UI adornment.
- `chatId`: active chat ownership scope.
Required invariants:
- One visual writer: only the delivery machine may call React state setters for visible render units.
- Append-only render facts: render-visible transcript content and ordering are never mutated in place after projection can see them.
- Monotonic apply: lower `entryCount` is ignored; same `entryCount` plus same `contentHash` is ignored; same `entryCount` plus different `contentHash` is rejected during live delivery and logged for diagnosis.
- Phase stability: the same transcript entry window must not switch unit kind/id solely because runtime moved from loading to idle.
- Stable keys: render-unit ids derive from source entry ids and remain stable across equivalent projections.
- No raw-event hydration in React: raw events are delivery signals, not visible transcript data.
- No deliberate live fade loops: `.animate-narration-guard` or replacement animation must not replay on already-visible assistant content after equivalent projection updates.
Implementation sequence:

1. RED projection tests: prove loading-to-idle shape stability for pure assistant text, tool-assisted turns, dedicated tools, status/result boundaries, and source-entry id stability.
2. RED projection-key tests: prove append-only entry count increases on render-visible progress, non-render metadata updates do not change projection key, same count/same hash is equivalent replay, and same count/different hash is rejected during live delivery.
3. RED delivery reducer tests: raw events do not change visible units; coalesced events issue one refresh; stale snapshots/replies are ignored; same hash is ignored; same count/different hash is rejected and logged during live delivery; projection failure retains visible units; chat switches cannot leak prior units.
4. GREEN shared protocol/types: add `TranscriptProjectionKey` and carry it on `ChatSnapshot` plus `chat.getRenderUnits` response.
5. GREEN read models/responders: derive the projection key from the ordered source window and folded render units.
6. GREEN transcript runtime: enforce append-only render facts; any store update path that touches render-visible transcript data must append a new entry instead.
7. GREEN NATS transport: publish and dedupe snapshots with projection key preserved; do not strip the key from request/reply payloads.
8. GREEN client machine: add a pure reducer that owns visible units, pending refresh, request token, active chat ownership, and rejected projection diagnostics.
9. GREEN lifecycle: make `useTranscriptLifecycle` dispatch snapshot/raw-event/render-window events into the reducer; remove direct `setMessages` writes outside the machine.
10. GREEN renderer: keep `ChatTranscript` units-only; grouping and tool-boundary decisions stay in the shared projection fold.
11. GREEN animation: remove or gate `.animate-narration-guard` so stable units are not re-hidden on live refresh.
12. Verify: focused Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, `C3X_MODE=agent c3x check --include-adr`, `git diff --check`, and agent-browser live-turn smoke for no repeated remount/fade flash.

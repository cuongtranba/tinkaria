# chat-navigator-fix — Make the navigator capsule work + show-on-scroll/idle-hide

## Status
implemented

## Lane
normal

## Product Contract
The chat navigator capsule (bottom, with prev/next arrows + N/total + waypoint
label) must (1) actually navigate between user-prompt waypoints with the counter
reflecting position, and (2) appear when the user scrolls and auto-hide after the
page is still.

## Design Notes
- **Root cause (broken navigation):** the scroll listener in `useChatNavigator`
  attached to `scrollRef.current` in an effect that ran once; but `ChatTranscript`
  (the scroll container) is **lazy-loaded**, so `scrollRef.current` was `null` at
  effect time and the ref identity never changed → the listener was never
  attached. So `recomputeIndex` never ran on scroll, the counter froze at the
  mount value, and next/prev (which read `currentIndex`) couldn't progress.
- **Fixes (`useChatNavigator.ts`):**
  - Attach via a 250ms poll that (re)binds the scroll listener once
    `scrollRef.current` exists / changes (handles lazy mount + remounts).
  - Track the index from `virt.getVirtualItems()` real offsets instead of the
    sparse `measurementsCache` (which left far waypoints unmeasured and froze the
    index at waypoint 0).
  - `goNext`/`goPrev` set `currentIndex` optimistically so navigation always
    progresses; a `programmaticRef` guard stops scroll-tracking from clobbering
    the index mid smooth-scroll.
  - Added scroll-activity visibility: `visible` is set true on scroll and cleared
    after `NAV_IDLE_HIDE_MS` (1800ms) idle.
  - **Overlap fix:** navigating via `scrollToIndex(..., { behavior: "smooth" })`
    on the long thread left subsequent rows' `translateY` offsets stale relative
    to tall (just-measured) rows, so rows overlapped (e.g. a 4550px row at
    translateY 12953 with the next row placed at 15605 → ~1898px overlap).
    Replaced with `scrollToWaypoint()`: an instant jump plus a second pass next
    frame, so the virtualizer recomputes offsets with real measured sizes. Manual
    gradual scroll never overlapped (it measures as items appear); the bug was
    specific to the smooth jump.
- **`ChatPage.tsx`:** the navigator container visibility now uses `chatNav.visible`
  (scroll-driven + idle-hide) instead of `state.showScrollButton`.

## Validation
| Layer | Expected proof |
| --- | --- |
| Unit | typecheck 0; chatWaypoints/scrollDetection tests green (23) |
| E2E | browser-harness: scroll → capsule opacity 0→1; idle 2.6s → 0; next/prev advance counter 1/7→2/7→3/7 and scroll to each waypoint; manual scroll updates counter (5000→1/7, 8000→2/7, 11000→3/7) |

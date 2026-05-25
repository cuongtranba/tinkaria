# Validation

## Proof Strategy

Backend behavior proven by `bun test` on `EventStore` (rename, pin, reorder,
sort, error on unknown id). Typecheck clean. UI proven end-to-end via
browser-harness on both surfaces with dual-signal (UI + persistence-after-reload).

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | rename updates name; pin sets pinned+sorts first; reorder assigns sortOrder by index; listIndependentWorkspaces sort order (pinned→sortOrder→createdAt); unknown id throws |
| Integration | command → responder → store → projection (covered by event-store tests against real store) |
| E2E | sidebar: rename/pin/move/delete; home card ⋯ menu: rename/pin/move/delete; order persists across reload |
| Platform | n/a |
| Performance | n/a |
| Logs/Audit | event log contains renamed/pin_toggled/reordered events |

## Fixtures

Throwaway workspaces created via the running app (cleaned up after).

## Commands

```text
bunx @typescript/native-preview --noEmit -p tsconfig.json
bun test src/server/event-store.test.ts
git diff --check
```

## Acceptance Evidence

- Typecheck: 0 errors (`bunx @typescript/native-preview --noEmit`).
- `bun test src/server/event-store.test.ts`: 17 pass (4 new: rename, pin sort, reorder+reload, unknown-id throws).
- browser-harness end-to-end against the running app (server restarted on new code, `/health` runner registered):
  - Home cards ⋯ menu: Pin zz-test-two → jumped to top with pin icon (both home + sidebar). Rename zz-test-one → "zz-renamed". Move "news" up → reordered within unpinned group.
  - Sidebar right-click menu: full menu (Rename/Pin/Move up/Move down/Delete), Move-down disabled at list end. Delete → confirm dialog → removed.
  - Reload persistence: pin + reorder survived a full page reload (order: zz-test-two, news, Working).
  - Event log `projects.jsonl` contained all four event types: renamed, pin_toggled, reordered, deleted.
- Two defects found and fixed during running-app verification:
  1. New commands were missing from the `SERVER_COMMANDS` NATS-subscription allowlist (`nats-responders.ts`) → commands silently no-op'd.
  2. `read-models.ts` sorted the client-facing list by `updatedAt` desc, ignoring pin/sortOrder → fixed to shared `compareIndependentWorkspaces`.

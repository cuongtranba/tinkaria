---
id: adr-20260416-fix-server-queue-message-client-visibility
c3-seal: 7540aa982b9681d6458039725f82dc65e0f7c8a9cd13762f69ee7d4e32898f27
title: fix-server-queue-message-client-visibility
type: adr
goal: Fix queue message visibility after moving queue ownership to the server. Client queued messages must render while the server holds queued follow-up work, survive snapshot hydration, and clear when the server no longer reports queued work.
status: implemented
date: "2026-04-16"
---

## Goal

Fix queue message visibility after moving queue ownership to the server. Client queued messages must render while the server holds queued follow-up work, survive snapshot hydration, and clear when the server no longer reports queued work.

## Work Breakdown

- Extend chat snapshots with the server-owned queued turn record from `state.queuedTurnsByChat`.
- Sync `ChatSnapshot.queuedTurn` into the client submit pipeline so `ChatInput` receives visible `queuedText` after server queue acceptance.
- Keep local queued text after `chat.queue` returns `{ queued: true }`; clear it only when the server sent immediately or later reports no queued work while idle.
- Add focused regression tests for read-model queue projection and submit-pipeline queue sync.

## Risks

- ChatSnapshot contract changed; native typecheck verifies all snapshot fixtures and consumers were updated.
- Queue clear timing can hide queued text if stale snapshots are treated as authoritative; implementation only clears no-queue snapshots when runtime is not processing, and command success keeps local text when server accepted the queue.
- Server queue remains event-sourced; no process-local queue fallback added.

## Parent Delta

| Layer | Verdict | Evidence |
| --- | --- | --- |
| Component | YES | c3-110 consumes queued chat snapshots; c3-204 exposes QueuedChatTurnSnapshot; c3-214 projects queued turns into chat snapshots. |
| Container | NO | c3-1 and c3-2 responsibilities already include chat UI and persistent server state/read-model delivery; no boundary change. |
| Context | NO | No topology change. |
| Refs/Rules | NO | Follows event-sourcing queued-work requirement and transcript/read-model/test rules; no shared rule update needed. |

## Verification

RED: `bun test src/server/read-models.test.ts src/client/app/useAppState.machine.test.ts` failed because `chat.queuedTurn` was undefined and `syncServerQueuedSubmit` did not exist.

GREEN: `bun test src/server/read-models.test.ts src/client/app/useAppState.machine.test.ts` passed 19 tests / 39 assertions.

Broader: `bun test src/client/app/useAppState.machine.test.ts src/client/app/useAppState.test.ts src/server/read-models.test.ts src/server/runner-proxy.test.ts src/server/nats-responders.test.ts` passed 144 tests / 290 assertions.

Typecheck: `bunx @typescript/native-preview --noEmit -p tsconfig.json` passed.

C3: `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check --include-adr` passed.

Whitespace: `git diff --check` passed.

Browser smoke: `bun run dev -- --port 5180 --no-open --strict-port` started client/server cleanly, `axi open http://localhost:5180/`, `axi snapshot`, `axi screenshot /tmp/tinkaria-queue-smoke.png`, and `axi console --type error` showed the app connected with no console errors. Dev server logs showed NATS WS upgrades and upstream open without errors.

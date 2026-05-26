---
id: adr-20260415-fix-codex-chat-already-running
c3-seal: c0971e6418078cc4f62406b53780f32ea7bc891b463bf8ca9dfe6e8eb2435a9d
title: fix-codex-chat-already-running
type: adr
goal: Fix the Codex session state bug where send_input against an already-running child chat surfaced as a busy/already-running error with only Dismiss available.
status: implemented
date: "2026-04-15"
---

## Goal

Fix the Codex session state bug where send_input against an already-running child chat surfaced as a busy/already-running error with only Dismiss available.

Decision: queue orchestration follow-up input when the target child chat is active instead of throwing. Also make RunnerProxy.activeTurns.has include just-started chats, because Codex can call send_input immediately after spawn_agent before transcript status events reach TranscriptConsumer.

Documentation finding: the C3 mismatch was real. c3-210, c3-206, c3-208, and c3-226 documented queued ownership and active status only generically, but did not state that active-turn truth spans RunnerProxy.recentlyStartedChats plus TranscriptConsumer-observed activeStatuses. Future troubleshooting now has the exact duplicate-start symptom, owning files, and focused test commands.

Work Breakdown:

- Updated src/server/orchestration.ts so SessionOrchestrator.sendInput() delegates active targets to coordinator.queue() with the normalized provider/model.
- Updated src/server/runner-proxy.ts so activeTurns.has covers both observed active statuses and recentlyStartedChats without recursion.
- Updated src/server/orchestration.test.ts so the active-target regression proves queueing and no extra immediate start.
- Updated src/server/runner-proxy.test.ts so recently started Codex chats are active immediately for orchestration.
- Updated C3 docs for c3-206, c3-208, c3-210, and c3-226 to document active-state sources, queue-drain ownership, duplicate-start symptoms, and exact verification commands.
Parent Delta: none. The server container, orchestration, agent, kit-runtime, and transcript-runtime responsibilities already cover session orchestration, queued follow-up ownership, active-turn state, runner handoff, and queue-drain triggers; this change makes those existing contracts explicit.
Verification:
- bun test src/server/runner-proxy.test.ts --test-name-pattern 'activeTurns.has() returns true immediately'
- bun test src/server/orchestration.test.ts --test-name-pattern 'queues input if target is already running'
- bun test src/server/orchestration.test.ts src/server/runner-proxy.test.ts src/server/codex-app-server.test.ts src/runner/runner-agent.test.ts
- bunx @typescript/native-preview --noEmit -p tsconfig.json
- C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
- git diff --check
Note: transcript-consumer.test.ts currently fails during embedded NATS JetStream setup with 'insufficient storage resources available' before assertions; this is outside the patched code path.

## Verification Target

Reproduce or identify the stale-running path, add focused coverage where practical, then verify with tests/typecheck and browser smoke if frontend behavior changes.

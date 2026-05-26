---
id: adr-20260409-remote-only-cleanup
c3-seal: 7d4d49a3902ad8f0e8f103c447debb96b0c6f34bdb4cfdbccb4ebb4a5b09a618
title: remote-only-cleanup
type: adr
goal: Remove the in-process agent execution path. The split-mode runner becomes the only way to execute agent turns. This eliminates the dual-path complexity where both `AgentCoordinator` (in-process) and `RunnerProxy` (split mode) satisfy the `SessionCoordinator` duck type.
status: accepted
date: "2026-04-09"
---

## Goal

Remove the in-process agent execution path. The split-mode runner becomes the only way to execute agent turns. This eliminates the dual-path complexity where both `AgentCoordinator` (in-process) and `RunnerProxy` (split mode) satisfy the `SessionCoordinator` duck type.

## Decision

Server process becomes a thin API/NATS gateway. All turn execution happens in the runner process. `TINKARIA_SPLIT` flag is removed — split mode is always on.

## Affected Entities

- c3-210 (agent) — AgentCoordinator removed from server; runner-agent.ts becomes the sole coordinator
- c3-211 (providers) — codex-harness.ts, codex-runtime.ts removed; runner owns Codex subprocess management
- c3-206 (orchestration) — unchanged, already works through RunnerProxy
- c3-205 (nats-transport) — kit streams and subjects for Codex kit daemon removed

## Files to Remove

| File | Reason |
| --- | --- |
| src/server/codex-harness.ts | In-process Codex entry, replaced by runner's turn-factories.ts |
| src/server/codex-runtime.ts | InProcessCodexRuntime wrapper, only used by in-process path |
| src/server/local-codex-kit.ts | LocalCodexKitDaemon + ProjectKitRegistry + RemoteCodexRuntime — entire Codex Kit NATS distribution layer |
| src/server/local-codex-kit.test.ts | Tests for removed code |

## Files to Modify

| File | Change |
| --- | --- |
| src/server/server.ts | Remove mode branching (always RunnerProxy), remove AgentCoordinator import, remove codex kit references |
| src/server/agent.ts | Extract timestamped and discardedToolResult utilities (used by runner-agent.ts), then remove AgentCoordinator class |
| src/server/nats-streams.ts | Remove kit turn events stream if only used by local-codex-kit |
| src/server/harness-types.ts | Move to shared if runner needs it (check current import path) |
| src/server/nats-publisher.ts | Remove codex kit readiness from snapshots if published |

## Risk

- Runner process must always be available — no fallback to in-process
- Tests that use AgentCoordinator directly need rewriting or removal

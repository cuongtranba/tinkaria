---
id: adr-20260408-fix-codex-thread-resume-recovery
c3-seal: 2d8679ba76b6dea26e6b8788db3a7bbb96fee0a550886dd4a8d6b91c3c3a069b
title: fix-codex-thread-resume-recovery
type: adr
goal: Fix codex thread resume failures that cause threads to appear "deleted" with errors like "thread is not rollable".
status: proposed
date: "2026-04-08"
---

## Goal

Fix codex thread resume failures that cause threads to appear "deleted" with errors like "thread is not rollable".

## Problem

`isRecoverableResumeError()` in `codex-app-server.ts` uses a narrow allowlist of error snippets to decide whether a `thread/resume` failure should fall back to `thread/start`. When the Codex app-server returns an unrecognized error (e.g. "not rollable"), the session is killed and the error is thrown — leaving the chat in a broken state with no result/error entry recorded.

Additionally, `startTurnForChat` in `agent.ts` has no error handling for `startSession`/`startTurn` failures — the user's prompt is appended and `recordTurnStarted` is called, but no error result is recorded, leaving the chat stuck.

## Changes

1. **`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
**`src/server/codex-app-server.ts`**: Simplify `isRecoverableResumeError` — ANY `thread/resume` error is recoverable (fall back to `thread/start`). Auth/quota errors don't contain "thread/resume" in the message.
2. **`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.
**`src/server/agent.ts`**: Wrap `codexRuntime.startSession()` + `startTurn()` in try/catch within `startTurnForChat`. On failure, record a turn error result and call `recordTurnFailed` so the chat doesn't get stuck.

## Affects

- c3-216 (codex)
- c3-210 (agent)

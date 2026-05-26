---
id: rule-error-extraction
c3-seal: 726c19ad61fc14a69a3dcdbe131ded77e142f80d0282493b8df8fdc00c016fa3
title: error-extraction
type: rule
goal: Every catch block must safely extract error messages without assuming the caught value is an Error instance.
---

## Goal

Every catch block must safely extract error messages without assuming the caught value is an Error instance.

## Rule

All catch blocks MUST use `error instanceof Error ? error.message : String(error)` to extract messages. Never access `.message` directly on an untyped `error`.

## Golden Example

```typescript
// ✅ Server-side error handling with cleanup
try {
  await this.executeTurn(chatId, content)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  this.store.appendMessages(chatId, [{ 
    kind: "assistant_text",
    content: `Error: ${message}`,
  }])
} finally {
  this.activeTurn = null
}

// ✅ WebSocket error envelope
try {
  await handleCommand(ws, command)
} catch (error) {
  send(ws, {
    v: PROTOCOL_VERSION,
    type: "error",
    id,
    message: error instanceof Error ? error.message : String(error),
  })
}

// ✅ Nested finally with safe close
try {
  const result = await queryProvider(prompt)
  return result
} catch (error) {
  console.warn(`${LOG_PREFIX} Query failed:`, error instanceof Error ? error.message : String(error))
  return null
} finally {
  try { q.close() } catch { /* ignore close errors */ }
}
```

## Not This

```typescript
// ❌ Accessing .message without type check
catch (error) {
  console.log(error.message)  // error might not be Error
}

// ❌ Stringifying entire error object
catch (error) {
  send(ws, { message: JSON.stringify(error) })  // loses stack, exposes internals
}

// ❌ Ignoring the error silently
catch (error) {
  // empty catch — swallows errors without logging
}

// ❌ Re-throwing without context
catch (error) {
  throw error  // OK for propagation, but prefer adding context
}
```

## Scope

All TypeScript files in src/server/ and src/client/. Every catch block must follow this pattern.

## Override

Fire-and-forget `.catch(() => {})` is acceptable in these specific categories:

### 1. Cleanup .catch(() => {})

Closing already-closed connections or releasing resources where failure is expected and non-critical.

```typescript
// ✅ Connection already closed — ignore
stream.close().catch(() => {})
```

### 2. IPC handler .catch(() => {})

Fire-and-forget async handlers (e.g., `handleServerRequest`, `handleNotification`) where `failContext` has already handled cleanup and error reporting. The promise rejection is redundant — the child process died and teardown already ran. See `rule-subprocess-ipc-safety`.

```typescript
// ✅ failContext already cleaned up — rejection is redundant
this.handleServerRequest(request).catch(() => {})
this.handleNotification(method, params).catch(() => {})
```

### 3. Global safety net — MUST log

`process.on("unhandledRejection")` handlers are backstops, not fixes. They MUST log with `console.warn(LOG_PREFIX, ...)` so unhandled rejections are visible in logs. Never silently swallow at the global level.

```typescript
// ✅ Global safety net — log, don't crash
process.on("unhandledRejection", (reason) => {
  console.warn(LOG_PREFIX, "Unhandled rejection:", reason instanceof Error ? reason.message : String(reason))
})

// ❌ Silent global swallow — hides bugs
process.on("unhandledRejection", () => {})
```

### When to Log vs Swallow

Decision tree for `.catch()` and rejection handlers:

1. **failContext/cleanup already ran** → swallow (`.catch(() => {})`) — the error was already handled, logging it again is noise.
2. **Last-resort safety net** (global `unhandledRejection`) → log with `console.warn(LOG_PREFIX, ...)` — this is visibility into bugs you haven't caught yet.
3. **Neither applies** → the rejection is a bug. Fix the root cause. Don't add `.catch(() => {})` as a band-aid.

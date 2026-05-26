---
id: rule-subprocess-ipc-safety
c3-seal: d1db2b68f450681b4fdd2eb0b208227596ddb0df405333ace2c73952146b259c
title: subprocess-ipc-safety
type: rule
goal: 'All IPC with child processes (stdin writes, RPC responses) must be crash-safe: guarded by closed-state checks, wrapped in try/catch, and never surfaced as unhandled rejections.'
---

## Goal

All IPC with child processes (stdin writes, RPC responses) must be crash-safe: guarded by closed-state checks, wrapped in try/catch, and never surfaced as unhandled rejections.

## Rule

(1) Every write to a child process stdin MUST check the session/context closed flag before writing AND wrap the write in try/catch. A dead child raises EPIPE — this must be swallowed, not propagated. (2) Fire-and-forget async calls that may write to child IPC (`void handler()`) MUST append `.catch(() => {})` to prevent unhandled rejections. (3) When a child process dies (`close` event), the cleanup handler (`failContext`) MUST set the closed flag, finish async queues, and reject pending RPC promises — in that order. (4) Subsequent IPC writes after close are silently dropped, not errored.

## Golden Example

```typescript
// ✅ IPC write with closed-state guard and try/catch
private writeMessage(context: SessionContext, message: Record<string, unknown>) {
  if (context.closed) return
  try {
    context.child.stdin.write(`${JSON.stringify(message)}\n`)
  } catch {
    // Child process already dead — ignore write failures (EPIPE etc.)
  }
}

// ✅ Fire-and-forget async handler with .catch() safety
if (isServerRequest(parsed)) {
  this.handleServerRequest(context, parsed).catch(() => {
    // Swallow — failContext already handles cleanup
  })
  continue
}

if (isServerNotification(parsed)) {
  this.handleNotification(context, parsed).catch(() => {
    // Swallow — failContext already handles cleanup
  })
}

// ✅ Clean context teardown on child death
context.child.on("close", (code) => {
  if (context.closed) return
  queueMicrotask(() => {
    if (context.closed) return
    const message = context.stderrLines.at(-1) || `Child exited with code ${code ?? 1}`
    this.failContext(context, message)
  })
})

// ✅ failContext: resolve all pending work, then close
private failContext(context: SessionContext, message: string) {
  const pendingTurn = context.pendingTurn
  if (pendingTurn && !pendingTurn.resolved) {
    pendingTurn.queue.push({ type: "transcript", entry: errorEntry(message) })
    pendingTurn.queue.finish()
    context.pendingTurn = null
  }
  for (const pending of context.pendingRequests.values()) {
    pending.reject(new Error(message))
  }
  context.pendingRequests.clear()
  context.closed = true
}
```

## Not This

```typescript
// ❌ No closed-state guard — EPIPE crash on dead child
private writeMessage(context: SessionContext, message: Record<string, unknown>) {
  context.child.stdin.write(`${JSON.stringify(message)}\n`)
}

// ❌ void fire-and-forget without .catch() — unhandled rejection kills process
void this.handleServerRequest(context, parsed)

// ❌ Setting closed BEFORE rejecting promises — callers see stale state
private failContext(context: SessionContext, message: string) {
  context.closed = true  // too early — pending writes may still be in flight
  // ... reject promises ...
}
```

## Scope

All server code that communicates with child processes via IPC: `codex-app-server.ts` (Codex CLI), `nats-daemon-manager.ts` (NATS server), `runner-manager.ts` (split runner), and any future child process wrappers.

## Override

Internal async handlers that are fully synchronous (no IPC writes, no child interaction) do not need `.catch()` guards. The rule applies specifically to code paths that touch child process I/O.

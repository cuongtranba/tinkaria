---
id: rule-prefixed-logging
c3-seal: 91d10ffc8ee824f48abf6522d6c5f2f0c7e6d83341f233779e1454a30acf72f6
title: prefixed-logging
type: rule
goal: Consistent, greppable logging across the codebase using the shared LOG_PREFIX constant and appropriate severity levels.
---

## Goal

Consistent, greppable logging across the codebase using the shared LOG_PREFIX constant and appropriate severity levels.

## Rule

(1) All server logs MUST use `LOG_PREFIX` from `src/shared/branding.ts`. (2) Use `console.warn()` for recoverable errors and state resets. (3) Use `console.log()` for CLI output only. (4) Use `console.info()` with module-specific prefix for debug tracing. (5) Never use bare `console.error()` — if it's fatal, throw; if recoverable, warn.

## Subprocess Prefixes

Separate processes spawned as children (e.g., `nats-daemon.ts`, `runner.ts`, `generate-merge-context.ts`) define their own local `LOG_PREFIX` constant with a process-specific tag. This is intentional — these processes have their own `stdout`/`stderr` streams and cannot import the shared branding constant at runtime.

Convention: `const LOG_PREFIX = "[process-name]"` at the top of the entry file. The bracket format `[name]` must match the main server's style so all logs remain greppable.

## Severity Classification

| Category | Level | Example |
| --- | --- | --- |
| Crash isolation — unhandled rejections, child death, safety nets | console.warn | LOG_PREFIX, "unhandled rejection (swallowed):", message |
| Operational events — startup, shutdown, connection loss, reconnect | console.warn | LOG_PREFIX, "Received SIGTERM, shutting down" |
| Recoverable errors — corrupt data, failed I/O, state resets | console.warn | LOG_PREFIX, "Failed to load snapshot, resetting:", error |
| CLI user output — startup banner, URLs, one-time info | console.log | APP_NAME, "— local-only project chat UI" |
| Debug traces — module-level state changes, client-side flow | console.info | "[useTinkariaState] subscription updated" |
| console.error is never used directly. Fatal conditions throw; everything else warns. |  |  |

## Golden Example

```typescript
import { LOG_PREFIX } from "../shared/branding"

// Recoverable error — warn with prefix
console.warn(`${LOG_PREFIX} Failed to load snapshot, resetting:`, error)

// State reset notification
console.warn(`${LOG_PREFIX} Resetting local chat history due to version mismatch`)

// Event replay warning
console.warn(`${LOG_PREFIX} Failed to replay ${file}, skipping corrupt line`)

// File system issue
console.warn(`${LOG_PREFIX} Failed to watch config file:`, error)

// CLI startup output — console.log only for user-facing CLI
console.log(`${APP_NAME} — local-only project chat UI`)
console.log(`  Local:   http://localhost:${port}`)

// Client-side debug with module prefix
function logTinkariaState(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[useTinkariaState] ${message}`)
    return
  }
  console.info(`[useTinkariaState] ${message}`, details)
}

// --- Crash isolation / resilience ---

// Process-level safety net — swallow unhandled rejections to prevent cascade
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  console.warn(LOG_PREFIX, "unhandled rejection (swallowed):", message)
})

// Child process death — log and mark session failed, don't crash server
context.child.on("error", (error) => {
  this.failContext(context, error.message)
})
context.child.on("close", (code) => {
  const message = context.stderrLines.at(-1) || `Process exited with code ${code ?? 1}`
  this.failContext(context, message)
})

// Subprocess operational events (own LOG_PREFIX)
// In nats-daemon.ts:
const LOG_PREFIX = "[nats-daemon]"
console.warn(LOG_PREFIX, "Received SIGTERM, shutting down")
console.warn(LOG_PREFIX, "NATS server started without WebSocket support")
```

## Not This

```typescript
// ❌ No prefix — impossible to grep
console.log("Failed to load snapshot")

// ❌ console.error for recoverable situations
console.error("Connection dropped, retrying...")  // use console.warn

// ❌ Template literal without LOG_PREFIX
console.warn(`[server] something happened`)  // use LOG_PREFIX constant

// ❌ Debug logging without module context
console.log("here")  // no context
console.log(data)     // no description

// ❌ Letting unhandled rejections crash the server
// (no process.on("unhandledRejection") handler)
// A child process coredump bubbles into an unhandled promise rejection
// and takes down the entire server

// ❌ Using console.error for crash isolation
console.error("child process died")  // use console.warn — it's recoverable

// ❌ Subprocess importing shared LOG_PREFIX
import { LOG_PREFIX } from "../shared/branding"  // wrong in a separate process
// Define a local LOG_PREFIX instead
```

## Scope

## Override

Test files may use bare console calls for debugging. Remove before committing.

---
id: rule-rule-bun-runtime
c3-seal: 659c7c54ef82ec57a212c7081376773ac5a65c420b9ca36023d3e40f85e29baf
title: rule-bun-runtime
type: rule
goal: Ensure the server codebase exclusively uses Bun APIs and never falls back to Node.js compatibility layers.
---

## Goal

Ensure the server codebase exclusively uses Bun APIs and never falls back to Node.js compatibility layers.

## Rule

Never use Node.js APIs or require Node.js compatibility. Use Bun-specific APIs (Bun.serve, Bun.spawn, Bun PTY, Bun.file) for all server-side operations.

## Golden Example

```typescript
// HTTP server
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("ok");
  },
  websocket: { message(ws, msg) { /* ... */ } }
});

// File I/O
const data = await Bun.file("config.json").json();
await Bun.write("output.txt", content);

// Process spawning
const proc = Bun.spawn(["ls", "-la"], { cwd: "/tmp" });
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| import http from "node:http" | Bun.serve() | Node http module adds unnecessary compat layer |
| import fs from "node:fs/promises" | Bun.file() / Bun.write() | Bun file APIs are faster and more ergonomic |
| child_process.spawn() | Bun.spawn() | Bun.spawn is native, avoids Node compat overhead |
| require("express") | Bun.serve({ fetch }) | Express depends on Node http, Bun.serve is native |

## Scope

Applies to all server-side code. Client-side (React/Vite) code may use standard Web APIs. Shared types are pure TypeScript with no runtime dependency.

## Override

Only if a critical dependency has no Bun-compatible alternative and the functionality cannot be implemented natively.

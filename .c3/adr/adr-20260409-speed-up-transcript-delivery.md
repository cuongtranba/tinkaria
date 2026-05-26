---
id: adr-20260409-speed-up-transcript-delivery
c3-seal: fb8b10d0feda892966e407486333e6da24ac356ccb456f5e83ddf5481b38b5ac
title: speed-up-transcript-delivery
type: adr
goal: 'Speed up transcript delivery end-to-end by addressing three high-impact bottlenecks:'
status: accepted
date: "2026-04-09"
---

## Goal

Speed up transcript delivery end-to-end by addressing three high-impact bottlenecks:

1. **Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
**Decouple NATS publish from disk write** — `onMessageAppended` fires inside `writeChain.then()`, meaning every transcript entry waits for `appendFile` before NATS publish. Fire publish immediately, let disk I/O continue in background.
2. **Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
**Batch client `setMessages()` calls** — Currently one React state update per NATS message (10-20/sec during streaming). Use `requestAnimationFrame` accumulator to batch hydrations and render once per frame (~60fps cap).
3. **Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.
**Replace `readFileSync` with async read** — `loadTranscriptFromDisk()` uses synchronous file read, blocking the Bun event loop during initial transcript load.

### Secondary Fixes

1. Expand single-slot transcript cache to small LRU (5 chats)
2. Gate `debugRaw` behind DEBUG flag on claude-harness entries
3. Lower direct NATS WS probe timeout from 2000ms to 500ms

### Work Breakdown

| # | Fix | Files | Impact |
| --- | --- | --- | --- |
| 1 | Decouple publish from writeChain | src/server/event-store.ts | Latency: publish no longer waits for fsync |
| 2 | rAF-batched setMessages | src/client/app/useTranscriptLifecycle.ts | Renders capped at 60fps vs 10-20 per sec |
| 3 | Async loadTranscriptFromDisk | src/server/event-store.ts | Unblocks event loop during initial load |
| 4 | LRU transcript cache | src/server/event-store.ts | Fewer disk re-reads under concurrent access |
| 5 | Gate debugRaw | src/server/claude-harness.ts | Smaller payloads, less serialization |
| 6 | Lower WS probe timeout | src/client/app/nats-socket.ts | Faster fallback to proxy path |

### Affected Entities

- c3-201 (event-store) — writeChain decoupling, async read, LRU cache
- c3-110 (chat) — useTranscriptLifecycle batching
- c3-208 (kit-runtime) — indirectly benefits from faster publish

### Risks

- Fix 1: Must ensure JSONL ordering is preserved even though publish fires before write completes. The writeChain still serializes writes — we just fire the callback earlier.
- Fix 2: rAF batching adds up to 16ms latency per message — acceptable tradeoff for fewer renders.
- Fix 3: Must handle concurrent async reads without race conditions.

### Status

Accepted. Implementing fixes 1-6.

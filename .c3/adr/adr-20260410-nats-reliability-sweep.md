---
id: adr-20260410-nats-reliability-sweep
c3-seal: 17eacf92fd9bf8f95b27ab26b1178b8dfb1443f97a85c811a2ed023bfadc3c54
title: Fix NATS transport reliability (Phase 0 observability + Phase 1 P0 fixes)
type: adr
goal: 'Stabilize the NATS transport between browser/runner and the embedded nats-server. Observed: unstable, slow, frequent reconnects. Empirically reproduced: the `/nats-ws` proxy''s upstream `send()` is called while the upstream WebSocket is still `CONNECTING` (readyState=0), which throws `InvalidStateError` (test at `/tmp/final-race-demo.ts`). Sweep identified additional P0 bugs: double-open race in client `probeConnection`, orphaning `resetConnection`, potentially-double `monitorStatus` loops, and entirely unconfigured runner reconnect. Log blindness makes reconnect rate invisible today.'
status: implemented
date: "2026-04-10"
---

## Goal

Stabilize the NATS transport between browser/runner and the embedded nats-server. Observed: unstable, slow, frequent reconnects. Empirically reproduced: the `/nats-ws` proxy's upstream `send()` is called while the upstream WebSocket is still `CONNECTING` (readyState=0), which throws `InvalidStateError` (test at `/tmp/final-race-demo.ts`). Sweep identified additional P0 bugs: double-open race in client `probeConnection`, orphaning `resetConnection`, potentially-double `monitorStatus` loops, and entirely unconfigured runner reconnect. Log blindness makes reconnect rate invisible today.

## Scope

Phase 0 (observability) + Phase 1 (all P0 fixes) only.

Out of scope (deferred to follow-up ADRs): direct `claude-nats.tini.works` tunnel advertisement, P1/P2 races (command stale-nc, unsubscribe/reactivate, transcript-consumer silent death, heartbeat error handling, decompression silent skip), Caddy timeout tuning, NATS `auth_timeout` bump, `/tmp/nats-embedded-*` cleanup, broad test backfill.

## Work Breakdown

### Phase 0 — Observability (ships first, then 10 min run before Phase 1)

**P0-0.** `src/server/server.ts` — add prefixed logs inside `/nats-ws` proxy (lines 260-327):

- upgrade accepted (once per connection)
- upstream `onopen`, `onerror` (code + reason), `onclose` (code + duration)
- send-on-CONNECTING detected (counter, not per-frame)
- per-minute counter summary via `setInterval`
- use `LOG_PREFIX` per `rule-prefixed-logging`
- Owner agent: `proxy-observability`
- Files: `src/server/server.ts`

### Phase 1 — P0 Fixes (one bundle, RED/GREEN TDD per task)

**P1-A. Upstream race — `src/server/server.ts:303-327`**

- Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
Add `upstream.onopen`; only mark ready when `readyState === OPEN`
- In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
In `message(ws)`: check `readyState === OPEN` before `.send()`; wrap in try/catch; log failures
- Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
Bounded inbound buffer: hold client frames until upstream OPEN; flush synchronously inside `onopen`; if buffer exceeds `WS_PROXY_BUFFER_LIMIT = 256` frames, log-and-drop oldest
- RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
RED test in `src/server/server.test.ts`: start two `Bun.serve` instances (fake upstream with delayed open + real proxy), client sends frame before upstream open, assert frame delivered and no error thrown
- Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
Owner agent: `proxy-upstream-race`
- Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
Files: `src/server/server.ts`, `src/server/server.test.ts`
**P1-B. Double-open race — `src/client/app/nats-socket.ts:111-129`**
- Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
Remove direct-URL probe entirely for HTTPS path (dead code, already skipped at line 89)
- For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
For HTTP path, replace `Promise.race` with `AbortController` that cancels the in-flight `wsconnect`
- Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
Only fall through to proxy `connect()` once the prior attempt is fully aborted
- RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
RED test in `src/client/app/nats-socket.test.ts`: mock `wsconnect`, simulate timeout, assert exactly one `wsconnect` call after probe timeout
- Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
Owner agent: `client-double-open`
- Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-C. resetConnection must close — `src/client/app/nats-socket.ts:387-396`**
- `await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
`await this.nc?.close().catch(() => {})` before nulling `this.nc`
- Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
Mirror the drain pattern from `dispose()` (line 139)
- Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
Guard against re-entrance (no-op if already resetting)
- RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
RED test: spy on `nc.close`, call `resetConnection`, assert `close` called before `nc` nulled
- Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
Owner agent: `client-reset-orphan`
- Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-D. monitorStatus single-loop invariant — `src/client/app/nats-socket.ts:266-299`**
- Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
Capture local `const nc = this.nc` at loop entry
- Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
Exit loop if `this.nc !== nc` (connection reassigned)
- Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
Reactivate subscriptions against the CAPTURED `nc`, not `this.nc`, via a local `activateOn(nc, id, entry)` helper
- Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
Do not call `this.activateSubscription` from inside the loop
- RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
RED test: fire two back-to-back reconnect events on a mock `nc.status()` iterator, assert exactly one loop is running and subscriptions are activated exactly once against the captured `nc`
- Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
Owner agent: `client-monitor-loop`
- Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
Files: `src/client/app/nats-socket.ts`, `src/client/app/nats-socket.test.ts`
**P1-E. Runner reconnect config — `src/runner/runner.ts`**
- Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
Pass full reconnect options to `connect(...)`: `maxReconnectAttempts: -1`, `reconnectTimeWait: 750`, `pingInterval: 15_000`, `maxPingOut: 3`
- Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
Wrap `nc.drain()` in `Promise.race` with 3s timeout + fallback `nc.close()`
- Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
Wrap `publishHeartbeat()` publishes in try/catch with `LOG_PREFIX` warn (`rule-error-extraction` + `rule-prefixed-logging`)
- RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
RED test in `src/runner/runner-nats.test.ts`: inject mock nc that drops and recovers, assert runner does not throw, heartbeat resumes, drain does not hang
- Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
Owner agent: `runner-reconnect`
- Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`
Files: `src/runner/runner.ts`, `src/runner/runner-nats.ts`, `src/runner/runner-nats.test.ts`

## Execution Order

1. **P0-0 first, sequentially.** Ship observability; run 10 min against `claude.tini.works` via `agent-browser`; inspect counter summary output. Confirm reconnect rate empirically.
2. **P1-A..E in parallel subagents.** Each agent owns one file/concern; writes RED test first, then GREEN fix. No cross-task dependencies.
3. **`bun test` green** before merge.
4. **End sequence:** `/noslop` -> `/simplify` -> `/review`.
5. **C3 audit:** `/c3` + `c3x check` + `c3x codemap` to keep coverage at 100%.
6. **Mark ADR implemented.**

## Constraint Chain

| Source | Rule | How Honored |
| --- | --- | --- |
| ref-runtime-operational-readiness | observable + crash-resilient | Phase 0 adds logs; Phase 1 fixes crash sources |
| ref-ref-websocket-protocol | real-time bidirectional without polling | Race fix preserves protocol; bounded buffer does not reorder |
| rule-prefixed-logging | LOG_PREFIX, console.warn recoverable | All new logs use prefix |
| rule-error-extraction | safe message extraction | Every new catch uses the idiom |
| rule-graceful-fallbacks | normalize inputs, never crash on bad data | Buffer drop policy logs and continues |
| rule-subprocess-ipc-safety | closed-state guards on IPC writes | Proxy checks readyState === OPEN before .send() |
| rule-bun-test-conventions | describe/test, afterEach cleanup, typed helpers | All new tests follow pattern |
| rule-rule-strict-typescript | no any | Captured-nc types are NatsConnection |

## Risks

- **Buffered messages may reorder** if upstream opens mid-stream. Mitigation: flush synchronously inside `onopen` before returning, disable buffering once OPEN.
- **Probe removal may surprise local dev** if someone relied on it. Mitigation: retain HTTP path behind `AbortController`; HTTPS path is the removed one.
- **Runner reconnect change extends recovery window** from "crash-restart by systemd" to "in-process reconnect". Validate runner still registers in KV on reconnect.
- **Observability logs too noisy** if reconnects are frequent. Mitigation: counters + per-minute summary, not per-frame logs.
- **Test flakiness** from timing-sensitive race tests. Mitigation: use condition-polling, not arbitrary sleeps.

## Verification

- Every task lands at least one failing test first (RED), then the fix (GREEN).
- `bun test` green before merge.
- Phase 0 validated empirically: run 10 min against `claude.tini.works`, show counter summary output from `journalctl --user -u tinkaria`.
- Phase 1 validated by tests + manual smoke test via `agent-browser` on `claude.tini.works`: load page, navigate chats, toggle offline, confirm "Connected" returns within backoff and no console errors.

---
id: adr-20260408-session-process-isolation
c3-seal: fb0cf2d24532748e02dd39755996144c103fc0d5531ea3d92579e66b3556043f
title: session-process-isolation
type: adr
goal: 'Decouple agent session lifecycle from the Tinkaria UI server process so that:'
status: proposed
date: "2026-04-08"
---

## Goal

Decouple agent session lifecycle from the Tinkaria UI server process so that:

1. Active AI sessions (Claude SDK turns, Codex processes) survive server restarts/upgrades
2. Transcript continuity is guaranteed — zero missed events during restart windows
3. The UI server can reclaim ownership of running sessions after restart
4. No new external dependencies — leverage existing `@lagz0ne/nats-embedded` package

## Status

proposed

## Context

### Current Architecture (Single Process)

Everything runs inside one Bun process:

- **Claude turns**: `@anthropic-ai/claude-agent-sdk` `query()` — in-process async iterable over HTTP to Anthropic API
- **Codex turns**: `codex app-server` child process with piped stdio, JSON-RPC protocol
- **NATS**: Embedded via `@lagz0ne/nats-embedded`, memory-only JetStream, dies with server
- **State**: `activeTurns` Map, `SessionOrchestrator` maps — all in-memory, lost on restart
- **Persistence**: Event-sourced JSONL files — survive restarts, session tokens preserved
**What survives restart**: Session tokens (in `turns.jsonl`), transcripts (per-chat JSONL), chat/project metadata.
**What dies**: All running turns, orchestrator parent/child relationships, NATS JetStream history, Codex child processes.

### Existing Precedent

The `LocalCodexKitDaemon` + `RemoteCodexRuntime` already demonstrates the target pattern:

- Separate process connecting to embedded NATS via TCP
- Subject-based RPC (`runtime.kit.cmd.<kitId>.*`)
- Event streaming via JetStream (`runtime.kit.evt.turn.<chatId>`)
- Registration + heartbeat lifecycle

## Decision

### Four-Container Architecture

#### c3-3: NATS Daemon (Embedded, Long-lived)

A standalone Bun script (`src/nats/nats-daemon.ts`) that:

- Calls `NatsServer.start()` from `@lagz0ne/nats-embedded` with disk-backed JetStream
- Writes PID file (`<dataDir>/nats.pid`), port file (`<dataDir>/nats.port`), token file (`<dataDir>/nats.token`)
- Runs as a detached process — survives server and runner restarts
- Owns no business logic — purely infrastructure
**Not an external NATS install.** We spawn and own the binary via `@lagz0ne/nats-embedded`. Full control, zero system dependencies.
**JetStream config**: `storeDir: <dataDir>/jetstream/` for disk persistence. This is a one-option addition to the existing `NatsServer.start()` call. Auth token generated once, persisted to file, reused across process restarts.
**Startup discovery**: Any process (server, runner) checks `nats.pid` → alive? Read `nats.port` + `nats.token` → connect. Dead? Start new daemon, write fresh files.

#### c3-4: Session Runner (Detached, Long-lived)

A standalone Bun script (`src/runner/runner.ts`) that:

- Connects to NATS as a client (reads port/token files)
- Executes Claude SDK `query()` calls and Codex app-server management
- Publishes transcript entries to durable JetStream
- Maintains heartbeat on `runtime.runner.<runnerId>.heartbeat`
- Survives server restarts
**Runner lifecycle**:

```
spawn(detached) → connect NATS → register in KV → accept turn commands → stream results → heartbeat
                                                                                          ↓
UI server dies → runner keeps running → publishes to JetStream → UI restarts → reclaim via KV
```

**Process model**: One runner process. Handles sessions with internal concurrency. Architecture is runner-count-agnostic — NATS subjects keyed by `runnerId`, so adding runners later requires no protocol changes.

#### c3-2: Server (Restartable UI Process)

The existing Tinkaria server, modified to:

- **Not** execute Claude/Codex turns in-process
- Discover running NATS daemon on startup (PID/port/token files)
- Discover running runners via NATS KV registry
- Route turn commands to runners via NATS
- Consume transcript events from durable JetStream and write to JSONL
- Serve HTTP/WS/static as before

#### c3-1: Client (Unchanged)

Browser SPA connects via WS to NATS (proxied through server). No changes needed — the transcript event subjects (`runtime.evt.chat.<chatId>`) remain the same.

### NATS Subject Schema for Runner Protocol

```
runtime.runner.registry                    # KV bucket: runner metadata
runtime.runner.<runnerId>.heartbeat        # Heartbeat (every 5s, timeout 15s)
runtime.runner.cmd.<runnerId>.start_turn   # Request: start a turn
runtime.runner.cmd.<runnerId>.cancel_turn  # Request: cancel a turn
runtime.runner.cmd.<runnerId>.respond_tool # Request: tool response
runtime.runner.cmd.<runnerId>.shutdown     # Request: graceful shutdown
runtime.runner.evt.<chatId>               # JetStream: transcript entries from runner
runtime.runner.evt.>                       # Stream: KANNA_RUNNER_EVENTS (disk-backed)
```

**JetStream stream for runner events**:

```typescript
{
  name: "KANNA_RUNNER_EVENTS",
  subjects: ["runtime.runner.evt.>"],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,           // DISK-BACKED — survives NATS restart
  max_age: 24 * 60 * 60 * 1_000_000_000, // 24h retention
  max_msgs: 500_000,
  max_bytes: 512 * 1024 * 1024,        // 512MB
}
```

### Transcript Continuity Design

**Write path** (new):

```
Claude SDK query() → runner process → JetStream publish (durable, disk-backed)
                                          ↓
                          UI server consumes → appendMessage() to JSONL
                                          ↓
                          publishChatMessage() to browser JetStream
```

**During UI server downtime**:

```
Runner → JetStream (disk-backed, 24h retention)
         ... server down ...
Server restarts → creates durable consumer at last-known sequence
                → replays all missed events → writes to JSONL
                → broadcasts to reconnected browsers
```

**Sequence tracking**: UI server maintains per-chat last-processed JetStream sequence in NATS KV (`runner_consumer_state`). On restart, consumer starts from `lastSeq + 1`.

**Corruption safety**: Unlike current `appendFile` where mid-write crash can corrupt JSONL, the NATS-mediated path provides:

- Atomic JetStream message delivery (fully written or not)
- Consumer acknowledgement after successful JSONL write
- Replay from last-ack on crash recovery

### Ownership Reclaim Protocol

```
Tinkaria CLI starts
  ├── Check nats.pid → alive? connect. Dead? spawn nats-daemon
  ├── Start UI server
  │     ├── Connect to NATS (port/token from files)
  │     ├── Check KV "runner_registry"
  │     │     └── For each registered runner:
  │     │           ├── Check heartbeat (alive?)
  │     │           ├── Read runner metadata (chatIds, turn status)
  │     │           └── Resume JetStream consumers for active chats
  │     ├── Replay missed transcript events from JetStream
  │     ├── Rebuild activeTurns view from runner state
  │     └── Ready to serve
  └── If no runner found → spawn runner process
```

**Runner registration** (KV entry):

```json
{
  "runnerId": "runner-abc123",
  "pid": 12345,
  "startedAt": "2026-04-08T10:00:00Z",
  "activeTurns": {
    "chat-xyz": {
      "provider": "claude",
      "model": "claude-sonnet-4-6",
      "startedAt": "2026-04-08T10:05:00Z",
      "sessionToken": "session-token-here"
    }
  }
}
```

### Process Startup Chain

```
tinkaria CLI
  ├── 1. ensureNatsDaemon()
  │     ├── Check <dataDir>/nats.pid — process alive?
  │     ├── Yes → read nats.port + nats.token → connect
  │     └── No → Bun.spawn("nats-daemon.ts", {detached: true})
  │              → wait for port/token files → connect
  ├── 2. Start UI server (connects to NATS as client)
  └── 3. ensureRunner()
        ├── Check runner_registry KV — runner alive?
        ├── Yes → resume consumers, reclaim
        └── No → Bun.spawn("runner.ts", {detached: true})
                 → wait for registration in KV
```

## C3 Topology Change

### New Container: c3-3 nats

- **c3-301 nats-daemon** — Bun script wrapping `NatsServer.start()`, PID/port/token file management
- **c3-302 nats-schema** — Subject namespace, stream configs (including disk-backed KANNA_RUNNER_EVENTS), KV bucket definitions

### New Container: c3-4 runner

- **c3-401 runner-core** — Entry point, NATS connection, heartbeat, command dispatch, graceful shutdown
- **c3-410 agent** — AgentCoordinator (moved from c3-210), turn execution
- **c3-407 prompt-context** — Prompt composition (moved from c3-207)
- **c3-411 providers** — Provider catalog (moved from c3-211)
- **c3-416 codex** — Codex app-server management (moved from c3-216)
- **c3-408 kit-runtime** — Codex runtime (moved from c3-208)

### Modified in c3-2 server

- **c3-205 nats-transport** — Connect-only client, no server ownership
- **c3-206 orchestration** — Routes via NATS to runners instead of in-process
- **c3-201 event-store** — Writes from JetStream consumer instead of in-process calls
- **NEW: runner-manager** — Runner spawning, discovery, health monitoring
- **NEW: transcript-consumer** — Durable JetStream consumer → JSONL writer

### New in shared

- **runner-protocol** — NATS subject constants, message type definitions

### New Refs

- **ref-runner-protocol** — Runner ↔ Server NATS communication protocol
- **ref-nats-lifecycle** — NATS daemon process management pattern

### New Rules

- **rule-process-boundary** — Server (c3-2) and runner (c3-4) MUST NOT import each other's modules. All cross-boundary communication goes through NATS subjects defined in shared/

## Affected Components

- `c3-210` (agent) → moves to `c3-410` in runner container
- `c3-207` (prompt-context) → moves to `c3-407` in runner container
- `c3-211` (providers) → moves to `c3-411` in runner container
- `c3-216` (codex) → moves to `c3-416` in runner container
- `c3-208` (kit-runtime) → moves to `c3-408` in runner container
- `c3-205` (nats-transport) → modified: connect-only
- `c3-206` (orchestration) → modified: routes via NATS
- `c3-201` (event-store) → modified: JetStream consumer input
- `server.ts` → startup discovers NATS + runners

## Risks

1. **Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
**Claude SDK in subprocess**: `query()` returns async iterable. Runner serializes each message to NATS. SDK's HTTP connection stays within runner. **Risk: low.**
2. **NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
**NATS daemon crash**: All communication stops. **Mitigation**: Runner and server detect disconnect, buffer locally, reconnect with backoff. Daemon writes PID file — CLI can restart it. JetStream disk store survives daemon restart.
3. **Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
**Stale runner**: Runner hangs or becomes unresponsive. **Mitigation**: Heartbeat timeout (15s) + server can spawn replacement and force-kill stale one via PID.
4. **Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
**Ordering**: JetStream per-subject ordering guaranteed. Transcript events keyed by `runtime.runner.evt.<chatId>` — per-chat order preserved.
5. **Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.
**Startup race**: Server starts before NATS daemon is ready. **Mitigation**: `ensureNatsDaemon()` waits for port file to appear with exponential backoff.

## Implementation Plan

### Phase 1: NATS Daemon Extraction

- Create `src/nats/nats-daemon.ts` — standalone Bun script
- Implement PID/port/token file lifecycle
- Add `storeDir` config for disk JetStream
- Create `ensureNatsDaemon()` utility for server/runner startup
- Modify `NatsBridge` to connect-only mode
- Add `KANNA_RUNNER_EVENTS` disk-backed stream definition
- **Test**: Kill server, verify NATS stays alive, reconnect works

### Phase 2: Runner Process

- Create `src/runner/runner.ts` — standalone script
- Move Claude turn execution (`startClaudeTurn`) into runner
- Implement runner registration (KV), heartbeat, command dispatch
- Implement transcript event publishing to JetStream
- **Test**: Runner executes a turn, publishes events, survives server kill

### Phase 3: UI Server Integration

- Modify `AgentCoordinator` to route via NATS instead of in-process
- Add `transcript-consumer`: JetStream `runtime.runner.evt.>` → `appendMessage()`
- Implement runner discovery + ownership reclaim on startup
- Modify `SessionOrchestrator` to work with remote runners
- **Test**: Full cycle — start turn, kill server, restart, verify transcript continuity

### Phase 4: Codex Migration

- Move `CodexAppServerManager` into runner process
- Adapt JSON-RPC protocol within runner (runner spawns `codex app-server` as child)
- **Test**: Codex turns survive server restart

### Phase 5: Hardening

- Runner auto-restart on crash
- Graceful runner shutdown on SIGTERM
- Multiple runner support (if needed)
- Metrics/observability
- Migration path for existing installations

## Files Changed

### New Files

- `src/nats/nats-daemon.ts` — NATS daemon entry point (c3-301)
- `src/runner/runner.ts` — Session runner entry point (c3-401)
- `src/server/runner-manager.ts` — Runner spawning and health (c3-2)
- `src/server/transcript-consumer.ts` — JetStream → JSONL writer (c3-2)
- `src/shared/runner-protocol.ts` — NATS subjects + message types (shared)

### Modified Files

- `src/server/nats-bridge.ts` — Remove server ownership, connect-only
- `src/server/nats-streams.ts` — Add KANNA_RUNNER_EVENTS stream
- `src/server/agent.ts` — Route turns to runner via NATS
- `src/server/server.ts` — Startup: ensure NATS daemon, discover runners, wire consumers
- `src/server/orchestration.ts` — Delegate to runners via NATS
- `src/shared/nats-subjects.ts` — Add runner subject constants
- `src/server/cli.ts` / `cli-supervisor.ts` — Call ensureNatsDaemon() before server start

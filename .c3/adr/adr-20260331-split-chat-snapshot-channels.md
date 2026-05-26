---
id: adr-20260331-split-chat-snapshot-channels
c3-seal: 4cb71dcdde9da993b380dc2486b6c8e712c1db0f201ba071316548b0caf3746b
title: split-chat-snapshot-channels
type: adr
goal: Split the chat snapshot into two NATS channels — a bounded runtime snapshot and individual message events — eliminating O(n²) re-serialization and unbounded payload growth.
status: accepted
date: "2026-03-31"
---

## Goal

Split the chat snapshot into two NATS channels — a bounded runtime snapshot and individual message events — eliminating O(n²) re-serialization and unbounded payload growth.

### Problem

`deriveChatSnapshot` packs ALL transcript messages into a single NATS payload on every `onStateChange`. For a chat with N messages, every new message triggers re-serialization of all N+1 entries. This causes:

- O(n²) serialization cost over conversation lifetime
- Full JSONL disk read on every agent streaming event
- Payload exceeds NATS max_payload (8MB) for long conversations
- Compression (ADR adr-20260331-compress-nats-payloads) buys 10-20x headroom but doesn't fix the architecture

### Design

**1. Type change** — `ChatSnapshot.messages` removed, replaced with `messageCount: number`. Snapshot becomes bounded (~1KB).

**2. Two delivery channels:**

| Channel | Content | Size | Trigger |
| --- | --- | --- | --- |
| kanna.snap.chat.<id> | Runtime (status, title, provider, messageCount, availableProviders) | ~1KB | Status/metadata change |
| kanna.snap.chat.<id>.messages | Individual TranscriptEntry | ~1-10KB | Each appendMessage |
| 3. New command: chat.getMessages { chatId, offset?, limit? } — paginated initial load, returns TranscriptEntry[]. |  |  |  |

### Server changes

- `deriveChatSnapshot` (read-models.ts): Remove `getMessages` callback parameter. Return `{ runtime, messageCount, availableProviders }`.
- `appendMessage` (event-store.ts or agent.ts): After disk append, publish the individual entry to `kanna.snap.chat.<chatId>.messages` via the publisher.
- `publishSnapshot` (nats-publisher.ts): Chat topic now publishes only the runtime snapshot (~1KB). No compression needed.
- New responder: `chat.getMessages` command handler reads from `store.getMessages(chatId)` with offset/limit.

### Client changes

- `ChatSnapshot` type (shared/types.ts): Remove `messages`, add `messageCount`.
- `NatsSocket` (nats-socket.ts): Chat subscription also subscribes to `.messages` subject. New `subscribe` returns both snapshot listener and message listener.
- `useKannaState` (useKannaState.ts): On chat subscribe, fetch initial messages via `chat.getMessages`, then accumulate live message events. Messages stored in local ref (not in snapshot state).
- `processTranscriptMessages`: Unchanged — still takes `TranscriptEntry[]`.

### Affected entities

- c3-214 (read-models) — `deriveChatSnapshot` signature change
- c3-205 (nats-transport) — new message channel, publisher changes
- c3-204 (shared-types) — `ChatSnapshot` type change
- c3-201 (event-store) — new `getMessages(chatId, offset?, limit?)` overload
- c3-210 (agent) — publish message events after append
- c3-110 (client chat) — accumulator pattern for messages
- ref-ref-websocket-protocol — new topic type for message events
- ref-ref-event-sourcing — messages delivered as individual events (aligns with append-only model)

### What this eliminates

| Problem | Status after |
| --- | --- |
| O(n²) re-serialization | O(1) — only the new message is published |
| Full disk read on every event | Zero — messages come from in-memory write path |
| Unbounded payload size | Runtime: ~1KB. Messages: ~1-10KB each |
| Compression dependency | Defense-in-depth only, not load-bearing |
| Dedup cache risk | No dedup needed for append-only events |

### Status

Provisioned. The compression fix (adr-20260331-compress-nats-payloads) handles the immediate problem. This ADR tracks the architectural optimization for a future session.

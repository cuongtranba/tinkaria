---
id: adr-20260410-project-coordination-mcp
c3-seal: 66a049fb0d5bf6d9af3352559632cb951806608d9c150790e93d6cff5472f7d1
title: project-coordination-mcp
type: adr
goal: Cross-session project coordination built entirely on existing NATS + EventStore infrastructure, with MCP as a thin tool interface following the established `createOrchestrationMcpServer()` pattern.
status: proposed
date: "2026-04-10"
---

## Goal

Cross-session project coordination built entirely on existing NATS + EventStore infrastructure, with MCP as a thin tool interface following the established `createOrchestrationMcpServer()` pattern.

## Context

Sessions are isolated. Two sessions on the same project cannot see each other's intent, share tasks, or avoid file conflicts. TaskLedger (c3-219) is in-memory and lost on restart. ProjectAgent (c3-222) uses brittle keyword routing. The homepage (c3-117) is a launcher, not a coordination surface.

### What exists and must be maximized

**NATS infrastructure (c3-205):**

- 3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
3 JetStream streams: `KANNA_TERMINAL_EVENTS` (memory, 5min/10K/64MB), `KANNA_CHAT_MESSAGE_EVENTS` (memory, 30min/50K/128MB), `KANNA_RUNNER_EVENTS` (file, 30min/50K/128MB)
- KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
KV bucket `runtime_snapshots` with dedup-on-publish (JSON string comparison via `lastJsonByKey`)
- 28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
28 command request/reply subjects under `runtime.cmd.*`
- Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
Snapshot pub/sub on `runtime.snap.*` with gzip compression (64KB threshold)
- Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
Subject hierarchy: `runtime.{snap|evt|cmd}.{domain}.{entityId}` for main subjects, with a divergent `runtime.runner.*` prefix for runner subjects
**EventStore (c3-201):**
- Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
Category JSONL files (projects.jsonl, chats.jsonl, turns.jsonl, messages.jsonl) + per-entity transcripts
- Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
Single-writer promise chain (serialized append + applyEvent)
- Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
Snapshot compaction to snapshot.json at 2MB threshold
- StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
StoreEvent union: ProjectEvent | ChatEvent | MessageEvent | TurnEvent
- **Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
**Important**: `compact()` and `clearStorage()` are hardcoded to the four existing JSONL files — adding any new JSONL file requires explicit updates to both methods
- Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
Extension pattern: add event type to union, add JSONL file, update applyEvent + compact + clearStorage, add read model, add NATS publisher case
**Read models (c3-214):**
- Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
Pure `derive*()` functions: `deriveSidebarData`, `deriveLocalProjectsSnapshot`, `deriveChatSnapshot`, `deriveSessionsSnapshot`
- Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
Triggered on-demand by `broadcastSnapshots(changedTypes?)` via `computeSnapshot(topic)`
- Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
Published dual-channel: `nc.publish()` to snapshot subject + `kv.put()` to KV bucket
- `snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
`snapshotKvKey` uses explicit cases for chat/terminal/sessions/orchestration, with a default fallback returning `topic.type` as string for sidebar/local-projects/update
**MCP server pattern — already exists:**
- `createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
`createOrchestrationMcpServer(orchestrator, callerChatId)` in orchestration.ts (line 565) exposes 5 MCP tools
- Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
Uses `createSdkMcpServer` from **`@anthropic-ai/claude-agent-sdk`** — NOT `@modelcontextprotocol/sdk`
- Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
Tools registered with Zod v4 schemas: `spawn_agent`, `list_agents`, `send_input`, `wait_agent`, `close_agent`
- Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
Transport is handled by the agent SDK framework externally
**Subscription protocol:**
- `SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
`SubscriptionTopic` union: sidebar | local-projects | update | chat | terminal | sessions | orchestration
- Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
Client subscribes via `snapshot.subscribe` command, server responds with initial snapshot, then pushes updates
**Coordination primitives (partial, must evolve):**
- TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
TaskLedger: in-memory Map, claim/complete/abandon, no project scoping, no events — **must be replaced**
- SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
SessionIndex: derives per-session summaries from transcript events — **reusable, needs replay-on-startup**
- TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
TranscriptSearchIndex: BM25 over transcripts — **reusable**
- ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
ProjectAgent: thin facade with keyword routing — **delegate() must be replaced, facade is fine**
- HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
HTTP routes at `/api/project/*` (8 routes) — **backend-agnostic, reusable**
- CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**
CLI `tinkaria-project` (8 commands) — **backend-agnostic, reusable**

## Decision

### 1. New JetStream stream for coordination events

```
Stream: KANNA_PROJECT_COORDINATION_EVENTS
Subjects: runtime.evt.project.>
Storage: File (like KANNA_RUNNER_EVENTS — durability across restarts)
Retention: Limits — 24h / 100K msgs / 256 MB
```

File-backed because coordination state must survive restarts. 24h retention gives ample replay window. No subject overlap with existing streams (terminal uses `runtime.evt.terminal.>`, chat uses `runtime.evt.chat.>`, runner uses `runtime.runner.evt.>`).

Events published with `Nats-Msg-Id` header for JetStream-native deduplication (verify `@nats-io/jetstream` version supports this — current is ^3.3.1, which does).

### 2. New EventStore JSONL for coordination

New file: `<dataDir>/coordination.jsonl` — all coordination events in a single category log, project-scoped via `projectId` field.

**Critical**: `compact()` (line 683) and `clearStorage()` (line 77) in event-store.ts are hardcoded to truncate/reset the four existing JSONL files. Adding coordination.jsonl requires explicit updates to BOTH methods. This is a migration-safety requirement, not optional.

New event types added to StoreEvent union:

```typescript
type CoordinationEvent =
  | { type: "todo_added"; projectId: string; todoId: string; description: string; priority: "high" | "normal" | "low"; createdBy: string }
  | { type: "todo_claimed"; projectId: string; todoId: string; claimedBy: string }
  | { type: "todo_completed"; projectId: string; todoId: string; outputs: string[] }
  | { type: "todo_abandoned"; projectId: string; todoId: string }
  | { type: "claim_created"; projectId: string; claimId: string; intent: string; files: string[]; sessionId: string }
  | { type: "claim_released"; projectId: string; claimId: string }
  | { type: "claim_conflict_detected"; projectId: string; claimId: string; conflictsWith: string; overlappingFiles: string[] }
  | { type: "worktree_created"; projectId: string; worktreeId: string; branch: string; baseBranch: string; path: string }
  | { type: "worktree_assigned"; projectId: string; worktreeId: string; sessionId: string }
  | { type: "worktree_removed"; projectId: string; worktreeId: string }
  | { type: "rule_set"; projectId: string; ruleId: string; content: string; setBy: string }
  | { type: "rule_removed"; projectId: string; ruleId: string }
```

All events carry `v: 2`, `timestamp: number`. applyEvent() switch has no default — unknown types silently fall through (safe, no crash). Replayed on startup via `replayLogs()` which must be updated to include coordination.jsonl.

New state in StoreState: `coordinationByProject: Map<string, ProjectCoordinationState>`.

### 3. New NATS subjects following existing hierarchy

| Pattern | Subject | Purpose |
| --- | --- | --- |
| Snapshot | runtime.snap.project.{projectId} | Live coordination state push |
| Events | runtime.evt.project.{projectId} | JetStream coordination events |
| Commands | runtime.cmd.project.todo.add | Request/reply mutations |
| Commands | runtime.cmd.project.todo.claim |  |
| Commands | runtime.cmd.project.todo.complete |  |
| Commands | runtime.cmd.project.todo.abandon |  |
| Commands | runtime.cmd.project.claim.create |  |
| Commands | runtime.cmd.project.claim.release |  |
| Commands | runtime.cmd.project.worktree.create |  |
| Commands | runtime.cmd.project.worktree.assign |  |
| Commands | runtime.cmd.project.worktree.remove |  |
| Commands | runtime.cmd.project.rule.set |  |
| Commands | runtime.cmd.project.rule.remove |  |
| Commands registered in nats-responders.ts via registerCommandResponders() — added to the existing SERVER_COMMANDS array (currently 28 entries). Each handler: validate → append to EventStore → broadcast snapshot. |  |  |
| Note: existing runtime.cmd.project.open/create/remove commands operate on project lifecycle, not coordination. The new runtime.cmd.project.todo.* / runtime.cmd.project.claim.* / etc. use dotted sub-namespacing to avoid collision. |  |  |

### 4. New subscription topic + read model

```typescript
// protocol.ts — new topic variant
| { type: "project"; projectId: string }

// nats-subjects.ts — explicit case (not relying on default fallback)
snapshotKvKey({ type: "project", projectId }) → `project.${projectId}`
```

New read model: `deriveProjectCoordinationSnapshot(state, projectId)` — pure function projecting `coordinationByProject.get(projectId)` into the snapshot shape.

Published via existing dual-channel: `nc.publish()` to `runtime.snap.project.{id}` + `kv.put()` to `runtime_snapshots` bucket key `project.{id}`.

`computeSnapshot()` in nats-publisher.ts gains a `"project"` case dispatching to the new derive function.

### 5. MCP server following createOrchestrationMcpServer pattern

```typescript
function createCoordinationMcpServer(
  store: EventStore,
  projectId: string
): ReturnType<typeof createSdkMcpServer>
```

Follows the exact same pattern as `createOrchestrationMcpServer()`:

- Uses `createSdkMcpServer` from `@anthropic-ai/claude-agent-sdk`
- Registers tools with Zod v4 schemas: `project.todo.add`, `project.claim.create`, etc.
- Each tool handler: validate params → call store mutation method → return result
- Transport handled by the agent SDK framework
MCP is a **thin adapter** — it translates tool calls into EventStore mutations (which trigger NATS publishing). No persistence, no state, no logic. All coordination logic lives in EventStore + read models.

### 6. Homepage subscribes via existing NATS pattern

The React client subscribes to `{ type: "project", projectId }` via `NatsSocket` — the exact same `subscribe()` / `onSnapshot()` pattern used for chat, sidebar, sessions, orchestration. No new transport, no MCP client in the browser.

Homepage mutations go through NATS commands (`runtime.cmd.project.*`) via `NatsSocket.command()` — the exact same `nc.request()` pattern used for all existing 28 commands.

### 7. NATS features to adopt

**NATS headers** — Coordination events published to JetStream carry headers: `Nats-Msg-Id` (dedup), `X-Project-Id`, `X-Session-Id`. Enables subject-filtered consumption without payload parsing. @nats-io/jetstream ^3.3.1 supports `js.publish()` with headers option.

**Durable consumers** — If the MCP server process needs to consume coordination events (e.g., for conflict detection), use a durable consumer with explicit ack. The `TranscriptConsumer` pattern (KV-tracked sequence for runner events) is the precedent.

**KV watches** — Evaluate in sub-project 1: `kv.watch()` on `project.{id}` could replace the snapshot pub/sub dual-write pattern. May not be worth the divergence from established pattern.

### 8. What changes in existing code

| File / Component | Change | Risk |
| --- | --- | --- |
| src/server/events.ts | Add CoordinationEvent to StoreEvent union, extend StoreState | Low — additive |
| src/server/event-store.ts | New coordination.jsonl path, replay in replayLogs(), applyEvent cases, mutation methods, update compact() and clearStorage() | High — core file, must update 2 hardcoded methods |
| src/server/read-models.ts | Add deriveProjectCoordinationSnapshot() | Low — additive |
| src/server/nats-publisher.ts | Add project case to computeSnapshot(), publish coordination snapshots | Low — follows pattern |
| src/server/nats-streams.ts | Add KANNA_PROJECT_COORDINATION_EVENTS stream creation | Low — additive |
| src/server/nats-responders.ts | Register 11 new command responders in SERVER_COMMANDS array | Low — follows pattern |
| src/shared/nats-subjects.ts | Add subject helpers, stream constant, KV key pattern with explicit case in snapshotKvKey | Low — additive |
| src/shared/protocol.ts | Add { type: "project"; projectId: string } to SubscriptionTopic, add command types | Low — additive |
| src/shared/types.ts | Add coordination snapshot types | Low — additive |
| src/server/task-ledger.ts | Replace — becomes read model over EventStore coordination events | High — full rewrite |
| src/server/project-agent.ts | Evolve: remove keyword routing, add EventStore-backed methods | Medium |
| src/server/project-agent-routes.ts | Point at new backend, add coordination routes | Low |
| src/client/app/nats-socket.ts | No change — existing subscribe/command patterns handle new topics | None |
| src/client/components/LocalDev.tsx | Add project status indicators, link to /project/:id | Low |
| New: src/client/components/ProjectDashboard.tsx | New route /project/:id with coordination panels | New file |
| New: src/server/coordination-mcp.ts | createCoordinationMcpServer() using @anthropic-ai/claude-agent-sdk | New file |

### 9. What NOT to change

- **NatsSocket** — existing subscribe/command patterns already support new topic types
- **nats-bridge / nats-daemon** — NATS server config unchanged, JetStream already enabled
- **Compression** — existing gzip pipeline handles coordination payloads
- **Auth** — single token model sufficient
- **SessionIndex / TranscriptSearchIndex** — reusable as-is

## Affects

- c3-201 (event-store): New coordination.jsonl, CoordinationEvent types, mutation methods, compact/clearStorage updates
- c3-205 (nats-transport): New JetStream stream, KV keys, command subjects, snapshot subjects
- c3-214 (read-models): New deriveProjectCoordinationSnapshot()
- c3-219 (task-ledger): Full replacement — becomes EventStore read model
- c3-222 (project-agent): Remove keyword routing, add EventStore-backed coordination
- c3-117 (projects): Add /project/:id dashboard, project status indicators
- c3-204 (shared-types): Coordination event/snapshot/MCP types

## Sub-Projects

1. **Durable project events** — CoordinationEvent types, coordination.jsonl with compact/clearStorage updates, applyEvent, ProjectCoordinationState in StoreState, JetStream stream, NATS command responders, snapshot publishing. Foundation.
2. **MCP tool surface** — `createCoordinationMcpServer()` using `@anthropic-ai/claude-agent-sdk` and `createSdkMcpServer`. Thin adapter: MCP tools → EventStore mutations.
3. **Project homepage** — New `{ type: "project" }` subscription topic, `/project/:id` route, coordination dashboard panels. Uses existing NatsSocket subscribe/command patterns.
4. **Claim system** — Intent + file claims, overlap detection in applyEvent, ClaimConflictDetected derivation. Conflict resolution UX deferred.
5. **Worktree management** — `git worktree add/remove` lifecycle in command responders, worktree assignment tracking.
6. **Project rules** — Rule CRUD, session discovery via MCP resources, enforcement model TBD.
7. **Workflow orchestration** — Multi-session workflow definitions, future phase.

## Verified Against Codebase

This ADR was verified claim-by-claim against source code by adversarial review:

- 28 NATS commands (not 27)
- MCP uses `@anthropic-ai/claude-agent-sdk` (not `@modelcontextprotocol/sdk`)
- compact() and clearStorage() must be explicitly updated for new JSONL
- snapshotKvKey needs explicit case for project topic (not default fallback)
- No subject/command naming collisions with existing infrastructure
- JetStream ^3.3.1 supports Nats-Msg-Id headers for dedup

## Status

Spec: `docs/superpowers/specs/2026-04-10-project-coordination-design.md` (needs update to match this ADR)

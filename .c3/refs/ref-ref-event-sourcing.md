---
id: ref-ref-event-sourcing
c3-seal: d054950372585548cad04f09e04999af47ae687acac92ea1dde8a6a4a1bbedd8
title: event-sourcing
type: ref
goal: 'Document the event sourcing pattern for Tinkaria: append-only JSONL events, snapshot compaction, replay, repair, and verification without a database dependency.'
---

## Goal

Document the event sourcing pattern for Tinkaria: append-only JSONL events, snapshot compaction, replay, repair, and verification without a database dependency.

## Choice

JSONL append-only logs per entity type (conversations, projects, preferences) with periodic snapshot.json files for fast startup. Events are appended sequentially; snapshots compact the log to avoid unbounded growth.

## Why

- Simple persistence without DB dependency — just files on disk
- Human-readable format enables easy debugging and manual inspection
- Append-only semantics are crash-safe (no partial writes corrupt state)
- Snapshot compaction keeps startup fast as logs grow
- Event replay enables time-travel debugging and state reconstruction

## How

Use one append-only event log per persistent domain plus snapshots for read/startup performance.

Implementation contract:

- Append events through store methods; do not mutate snapshot state directly from feature code.
- Each event must be replayable from an empty state and must carry enough identity to update exactly one aggregate.
- Snapshot compaction is an optimization only; replayed events remain the source of truth.
- Tests for new events must prove append, replay, and snapshot restore behavior.
- Manual recovery should prefer replay/repair paths over hand-editing derived snapshots.
- Queued work that must continue without a mounted frontend must be represented as store events, not only in React/Zustand state or process-local maps. `chat_turn_queued` and `chat_queued_turn_cleared` are the current queued-turn example.

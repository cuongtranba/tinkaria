---
id: adr-20260330-nats-transport-migration
c3-seal: 721c0a7f1acbc5c3bb1d90254a615ae49c74cfe5489c7d80fe4389349b13bf0c
title: nats-transport-migration
type: adr
goal: 'Replace hand-rolled Bun WebSocket transport (~750 LOC across ws-router.ts, socket.ts, protocol.ts) with NATS embedded server using @lagz0ne/nats-embedded. Phase 1: dual-publish (zero risk). Phase 2: new NATS client with feature flag. Phase 3: cut over. Phase 4: JetStream + KV + JWT auth.'
status: proposed
date: "2026-03-30"
---

## Goal

Replace hand-rolled Bun WebSocket transport (~750 LOC across ws-router.ts, socket.ts, protocol.ts) with NATS embedded server using @lagz0ne/nats-embedded. Phase 1: dual-publish (zero risk). Phase 2: new NATS client with feature flag. Phase 3: cut over. Phase 4: JetStream + KV + JWT auth.

## Decision

Adopt NATS as the sole real-time transport for Kanna. Use @lagz0ne/nats-embedded (subprocess model) to bundle nats-server with Kanna. Browser connects via wsconnect() from @nats-io/nats-core. Server connects via TCP loopback.

## Rationale

- Current ws-router.ts is O(clients × subscriptions) per state change; NATS is O(1) per subject
- Eliminates ~750 LOC of manual socket tracking, subscription maps, heartbeat, reconnect, fan-out
- NATS gives message replay (JetStream), KV snapshots, subject-level auth for free
- @lagz0ne/nats-embedded already exists and supports WebSocket + JetStream
- TCP loopback latency is ~5-20μs, negligible vs JSON serialization cost

## Consequences

- New process: nats-server runs alongside Bun (subprocess, auto-managed)
- Client bundle increases ~55-85KB gzipped (@nats-io/nats-core)
- Platform binaries shipped via optionalDependencies (6 platforms)
- Migration is 4 phases, each independently rollbackable

---
id: c3-205
c3-seal: fe03f36b3a3486f803b9fa73b46e9251820cc36d6a9b982fbf43aee168400485
title: nats-transport
type: component
category: foundation
parent: c3-2
goal: Embedded NATS transport layer — starts nats-server subprocess (TCP + WebSocket + JetStream), manages auth tokens, publishes snapshots to KV-backed subjects with dedup, handles command request/reply, and streams terminal events via JetStream.
uses:
    - ref-component-identity-mapping
    - ref-external-source-authority-boundaries
    - ref-fork-session-seeding
    - ref-nats-transport-hardening
    - ref-ref-jetstream-streaming
    - ref-ref-websocket-protocol
    - ref-runtime-operational-readiness
    - ref-transcript-render-state-machine
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-external-source-stale-handle-guards
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-subprocess-ipc-safety
---

# nats-transport

## Goal

Embedded NATS transport layer — starts nats-server subprocess (TCP + WebSocket + JetStream), manages auth tokens, publishes snapshots to KV-backed subjects with dedup, handles command request/reply, and streams terminal events via JetStream.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own nats-transport behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep nats-transport decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Transport snapshots, request/reply responses, and raw event notifications without changing transcript projection semantics. For transcript render delivery, NATS carries `renderUnits` and `TranscriptProjectionKey` together, preserves request tokens on render-window replies, and may dedupe identical payloads only without stripping projection metadata.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before nats-transport behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to nats-transport ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks nats-transport to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside nats-transport ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-transcript-render-state-machine | ref | Transport obligations for projectionKey preservation, snapshot/render-window payload integrity, and raw-event signal boundaries. | State-machine ref governs transcript delivery payloads over generic transport prose. | NATS transports key; c3-214 derives it and c3-118 applies it. |
| ref-ref-jetstream-streaming | ref | JetStream/KV streaming and snapshot delivery behavior. | Use alongside state-machine ref for transcript topics. | Transport ordering must not become projection freshness authority. |
| ref-ref-websocket-protocol | ref | Browser WebSocket subscription and request/reply protocol. | Projection metadata must survive the WebSocket boundary. | Client delivery reducer consumes key from received payload. |
| rule-graceful-fallbacks | rule | Recovery behavior when transport is disconnected or replies fail. | Failures retain visible units in client machine; transport should report failure clearly. | No blanking visible transcript on failed fetch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| chat snapshot publish | OUT | Publish chat snapshots with renderUnits and TranscriptProjectionKey preserved as one payload. | Transport does not derive, compare, or rewrite projection keys. | src/server/nats-publisher.ts; src/server/nats-publisher.test.ts; src/shared/types.ts |
| chat.getRenderUnits request/reply | IN/OUT | Return render-window units with projectionKey and preserve request/reply correlation so client can reject stale tokens. | Transport errors do not imply visible transcript should clear. | src/server/nats-responders.ts; src/server/nats-responders.test.ts; src/shared/protocol.ts |
| raw transcript event stream | OUT | Stream raw events as staleness/progress signals only; event payloads are not visible render-unit authority. | Client must fetch/apply projected snapshot/reply before changing visible units. | src/server/transcript-consumer.ts; src/client/app/useTranscriptLifecycle.test.ts |
| dedup/backfill | OUT | Dedup identical transport payloads without removing projectionKey; backfill/recovery replies keep key semantics intact. | Transport sequence/order is not a substitute for entryCount/contentHash freshness. | src/server/nats-publisher.test.ts; src/server/nats-responders.test.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Projection key stripped by transport | Snapshot or reply serialization omits projectionKey while renderUnits remain. | Publisher/responder protocol tests fail. | bun test src/server/nats-publisher.test.ts src/server/nats-responders.test.ts |
| Transport sequence mistaken for freshness | Client/server logic compares NATS order instead of TranscriptProjectionKey. | Reducer and responder tests assert key-based apply/ignore. | bun test src/client/app/useTranscriptLifecycle.test.ts src/server/nats-responders.test.ts |
| Failed render-window fetch blanks transcript | Request/reply failure causes empty visible units instead of retaining current state. | Delivery reducer projection.failed test. | bun test src/client/app/useTranscriptLifecycle.test.ts |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

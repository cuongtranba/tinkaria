---
id: c3-204
c3-seal: 5fab12856ecb15993eb7d39bfa0865e69ad443e9a120de9f6a6b5d0bf81a25ad
title: shared-types
type: component
category: foundation
parent: c3-2
goal: Shared type definitions, WebSocket/NATS command protocol envelope schema, tool normalization, port constants, and branding used by both client and server.
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-mcp-app-hosting
    - ref-transcript-render-state-machine
    - ref-zod-defensive-validation
    - rule-bun-test-conventions
    - rule-graceful-fallbacks
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
    - rule-type-guards
---

# shared-types

## Goal

Shared type definitions, WebSocket/NATS command protocol envelope schema, tool normalization, port constants, and branding used by both client and server.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own shared-types behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep shared-types decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Own shared protocol/types for transcript projection metadata across client and server. `TranscriptProjectionKey` belongs here so chat snapshots, render-window replies, reducer events, and tests share one shape: `{ chatId, entryCount, lastEntryId, contentHash }`. This component defines the wire contract but does not derive the key or decide freshness.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before shared-types behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to shared-types ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks shared-types to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside shared-types ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-transcript-render-state-machine | ref | TranscriptProjectionKey shape, snapshot/reply payload typing, and reducer-event type boundaries. | State-machine ref governs transcript projection metadata over generic shared-type prose. | Types carry the key; c3-214 derives it and c3-118 applies it. |
| ref-live-transcript-render-contract | ref | End-to-end transcript render-unit protocol expectations. | Use with state-machine ref for live transcript payloads. | ChatSnapshot and chat.getRenderUnits must expose render units plus projection metadata. |
| rule-type-guards | rule | Runtime validation/normalization for external protocol payloads. | Use named guards/normalizers for any untrusted key payload. | No inline shape guessing. |
| rule-rule-strict-typescript | rule | Compile-time exhaustiveness for projection-key and render-unit contracts. | Strict shared types are required before client/server implementation. | Typecheck via bunx native tsc. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| TranscriptProjectionKey type | OUT | Define shared key shape { chatId, entryCount, lastEntryId, contentHash } for all transcript projection snapshots/replies. | c3-204 does not derive hashes or compare freshness. | src/shared/types.ts; src/shared/protocol.ts |
| ChatSnapshot payload | OUT | Chat snapshots carry renderUnits and their projectionKey together so clients can apply/ignore deterministically. | Snapshots without key are invalid for delivery-machine visibility. | src/shared/types.ts; src/server/read-models.test.ts |
| chat.getRenderUnits reply | OUT | Render-window command replies carry renderUnits and the same projectionKey semantics as snapshots. | Reply metadata must survive request/reply transport. | src/shared/protocol.ts; src/server/nats-responders.test.ts |
| normalization/guards | OUT | Any external projection-key payload validation uses named guard/normalizer functions. | No ad hoc inline shape checks. | src/shared/protocol.ts; rule-type-guards |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Key shape forks | Client, server, or tests define separate projection-key shapes. | rg TranscriptProjectionKey src should point to shared type imports. | bunx @typescript/native-preview --noEmit -p tsconfig.json |
| Snapshot/reply omits key | ChatSnapshot or chat.getRenderUnits returns render units without projectionKey. | Protocol/read-model/responder tests fail. | bun test src/server/read-models.test.ts src/server/nats-responders.test.ts |
| Hash/freshness logic leaks into types | Shared type module starts deriving contentHash or applying freshness rules. | Code review of src/shared/types.ts and src/shared/protocol.ts. | bun test src/shared/transcript-render.test.ts src/server/read-models.test.ts |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

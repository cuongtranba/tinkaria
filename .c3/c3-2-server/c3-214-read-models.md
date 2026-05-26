---
id: c3-214
c3-seal: acdd797bbd09773a473f1a9cdaa0a2ae986c12c8d8c184c292c94e1db81a7944
title: read-models
type: component
category: feature
parent: c3-2
goal: CQRS read-side projections that derive sidebar data, chat snapshots, local project snapshots, transcript render units, and TranscriptProjectionKey metadata for WebSocket/request-reply delivery.
uses:
    - recipe-project-c3-app-flow
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-mcp-app-jtbd
    - ref-project-c3-app-surface
    - ref-ref-event-sourcing
    - ref-transcript-render-state-machine
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

# read-models

## Goal

CQRS read-side projections that derive sidebar data, chat snapshots, local project snapshots, transcript render units, and TranscriptProjectionKey metadata for WebSocket/request-reply delivery.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own read-models behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep read-models decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Derive deterministic read-side projections from event-store state. For transcript rendering, this component folds ordered append-only transcript entries into TranscriptRenderUnit windows and derives the matching TranscriptProjectionKey from the same source window. Read models derive projection identity; they do not decide client visibility or mutate transcript facts.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before read-models behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to read-models ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks read-models to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside read-models ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-transcript-render-state-machine | ref | Projection fold output, TranscriptProjectionKey derivation, contentHash stability, and snapshot/render-window metadata. | State-machine ref governs transcript read-model projection behavior. | Read model derives key; client delivery machine applies freshness. |
| ref-ref-event-sourcing | ref | Event-sourced read model derivation and replay determinism. | Append-only replay model must preserve deterministic projection output. | Projection key must be replay-stable. |
| rule-bun-test-conventions | rule | Focused read-model and projection tests. | Required for projection-key changes. | Use Bun tests. |
| rule-rule-strict-typescript | rule | Strict typing for snapshot/read-model outputs. | No loose projection metadata. | Typecheck via bunx native tsc. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| ordered transcript source window | IN | Consume ordered append-only TranscriptEntry windows from event-store state. | Read models do not mutate transcript entries or invent raw events. | src/server/read-models.ts; src/server/read-models.test.ts |
| render-unit projection | OUT | Fold the ordered source window into deterministic TranscriptRenderUnit[] using shared projection logic. | Grouping/tool-boundary decisions stay in shared projection, not React. | src/shared/transcript-render.ts; src/shared/transcript-render.test.ts; src/server/read-models.test.ts |
| TranscriptProjectionKey derivation | OUT | Derive { chatId, entryCount, lastEntryId, contentHash } from the same ordered source window and folded render units shipped to the client. | Do not use transport sequence, wall-clock time, or loading/idle UI state in contentHash. | src/server/read-models.ts; src/server/read-models.test.ts |
| ChatSnapshot output | OUT | Emit renderUnits and projectionKey together in chat snapshots. | Snapshots without projectionKey are not ready for delivery-machine visibility. | src/shared/types.ts; src/server/read-models.test.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Projection key not derived from same window | contentHash or entryCount uses a different entry slice than renderUnits. | Read-model tests compare snapshot key against render-window key for same source. | bun test src/server/read-models.test.ts src/server/nats-responders.test.ts |
| Volatile fields in contentHash | Hash includes timestamps outside source entries, request tokens, runtime loading flags, or object order instability. | Replay/equivalent projection tests fail same-hash assertions. | bun test src/server/read-models.test.ts src/shared/transcript-render.test.ts |
| Read model decides visibility | Read model suppresses same-count/different-hash or stale replies instead of exposing key for client reducer. | Reducer tests lack coverage or read-model code contains client freshness decisions. | bun test src/client/app/useTranscriptLifecycle.test.ts src/server/read-models.test.ts |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

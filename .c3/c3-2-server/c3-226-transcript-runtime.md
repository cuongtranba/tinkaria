---
id: c3-226
c3-seal: e80b307704cc43e51bd0ba03535d1969a0498d750d57ac0954af84f566faf8a8
title: transcript-runtime
type: component
category: feature
parent: c3-2
goal: 'Own server-side transcript event consumption: runner turn events, JetStream/KV resume, append-only render-relevant transcript facts, non-render metadata updates, active status tracking, queue-drain triggers, and state-change notifications that feed client subscriptions.'
uses:
    - c3-201
    - c3-204
    - c3-208
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - ref-transcript-render-state-machine
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

# transcript-runtime

## Goal

Own server-side transcript event consumption: runner turn events, JetStream/KV resume, append-only render-relevant transcript facts, non-render metadata updates, active status tracking, queue-drain triggers, and state-change notifications that feed client subscriptions.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own transcript-runtime behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep transcript-runtime decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Consume runner transcript events and preserve the append-only render-fact contract required by transcript projection freshness. Render-relevant transcript content and ordering are append-only after projection can see them. Store update calls may change non-render metadata, active status, title/provider/session state, queue bookkeeping, or operational indexes, but must not mutate text/tool/result/status payloads or ordering that can alter render units at the same entryCount.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before transcript-runtime behavior is changed. | ref-live-transcript-render-contract |
| Inputs | Accept only the files, commands, data, or calls that belong to transcript-runtime ownership. | ref-live-transcript-render-contract |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-live-transcript-render-contract |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-live-transcript-render-contract |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks transcript-runtime to deliver its documented responsibility. | ref-live-transcript-render-contract |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-live-transcript-render-contract |
| Alternate paths | When a request falls outside transcript-runtime ownership, hand it to the parent or sibling component. | ref-live-transcript-render-contract |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-live-transcript-render-contract |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-live-transcript-render-contract | ref | Provider stream, transcript runtime, read model, and visible transcript boundaries. | ref-transcript-render-state-machine narrows runtime behavior for render facts. | Use for full live transcript path. |
| ref-transcript-render-state-machine | ref | Append-only render facts, projection-key monotonicity, and raw-event signal semantics. | Append-only render-fact invariant beats generic store append/update wording. | Render-visible correction must append a new entry or change the ref to use projectionSeq/revision first. |
| rule-transcript-boundary-regressions | rule | Regression coverage for transcript runtime changes that could affect visible rendering. | Tests required for render-fact storage or projection-key changes. | Runtime tests must prove same-count render-visible mutation is not possible. |
| rule-prefixed-logging | rule | Diagnostic logs for rejected or suspicious projection state. | Use shared logging conventions for runtime diagnostics. | Useful when same-count/different-hash is detected downstream. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| runner event input | IN | TranscriptConsumer consumes runner events from JetStream and stores transcript/status/session/title/provider/plan changes. | Provider-specific turn startup remains c3-210/c3-208. | src/server/transcript-consumer.ts; src/server/transcript-consumer.test.ts |
| render-relevant transcript facts | OUT | Append text, tool calls, tool results, status/result payloads, hidden/render kind, source ids, and ordering as immutable facts after projection can see them. | No in-place update may change fields that alter TranscriptRenderUnit output at the same entryCount. | src/server/transcript-consumer.ts; src/server/event-store.test.ts; src/shared/transcript-render.test.ts |
| non-render metadata updates | OUT | Store update calls may change active status, title/provider/session metadata, queue bookkeeping, indexes, and other non-render metadata. | If a correction affects visible transcript rendering, append a new transcript entry instead of mutating the old one. | src/server/transcript-consumer.ts; src/server/read-models.test.ts |
| raw event notification | OUT | Published transcript events signal append progress/staleness; they do not carry authority for client-visible hydration. | Client delivery machine decides when a projected snapshot/reply becomes visible. | src/server/transcript-consumer.ts; src/client/app/useTranscriptLifecycle.test.ts |
| observed active statuses | OUT | activeStatuses is a transcript-observed status map, not the only source of active-turn truth; RunnerProxy also owns recentlyStartedChats for pre-status races. | c3-210 agent boundary | src/server/transcript-consumer.ts; src/server/runner-proxy.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Append-only invariant broken | A store update mutates render-visible transcript fields without increasing entryCount. | Projection-key tests produce same count/different hash for live delivery. | bun test src/server/transcript-consumer.test.ts src/server/event-store.test.ts src/shared/transcript-render.test.ts |
| Correction modeled as mutation | Tool/result/text correction overwrites an existing transcript entry. | Code review of transcript store update path and reducer same-count/different-hash rejection logs. | bun test src/server/transcript-consumer.test.ts src/server/read-models.test.ts |
| Active-state overclaim | A change treats TranscriptConsumer activeStatuses as the sole active-turn source. | Immediate post-start sendInput races miss active state until status_change is consumed. | Read c3-210 Contract; bun test src/server/runner-proxy.test.ts --test-name-pattern activeTurns.has |
| Queue drain missed | onStateChange does not call drainQueuedTurn when an active chat disappears. | Queued turns remain in EventStore after turn_finished/turn_failed/turn_cancelled. | bun test src/server/runner-proxy.test.ts --test-name-pattern drainQueuedTurn |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

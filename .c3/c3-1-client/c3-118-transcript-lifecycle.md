---
id: c3-118
c3-seal: 509d75d580a754eadf32ee22dffdda40a24c86fcf4a278122b9b356539af42c2
title: transcript-lifecycle
type: component
category: feature
parent: c3-1
goal: 'Own client transcript delivery state: cache restore, snapshot/render-window requests, projection freshness, raw-event coalescing, route ownership, and handoff of ready render units to the transcript renderer.'
uses:
    - c3-106
    - c3-204
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - ref-transcript-render-state-machine
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

# transcript-lifecycle

## Goal

Own client transcript delivery state: cache restore, snapshot/render-window requests, projection freshness, raw-event coalescing, route ownership, and handoff of ready render units to the transcript renderer.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own transcript-lifecycle behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep transcript-lifecycle decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Coordinate live transcript delivery for the active chat without directly deriving render semantics. Raw transcript events are stale signals: they update pending projection state and may trigger one render-window request, but they do not write visible render units. The delivery machine owns active chat identity, projection request tokens, freshness checks, visible units, and failure behavior.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before transcript-lifecycle behavior is changed. | ref-live-transcript-render-contract |
| Inputs | Accept only the files, commands, data, or calls that belong to transcript-lifecycle ownership. | ref-live-transcript-render-contract |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-live-transcript-render-contract |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-live-transcript-render-contract |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks transcript-lifecycle to deliver its documented responsibility. | ref-live-transcript-render-contract |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-live-transcript-render-contract |
| Alternate paths | When a request falls outside transcript-lifecycle ownership, hand it to the parent or sibling component. | ref-live-transcript-render-contract |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-live-transcript-render-contract |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-live-transcript-render-contract | ref | Provider stream, read model, snapshot, and client delivery boundaries. | ref-transcript-render-state-machine narrows client live-delivery behavior when flashing/stability is involved. | Use this for full transcript flow context. |
| ref-transcript-render-state-machine | ref | Delivery state machine, projection freshness key, raw-event no-op visibility, request-token ownership, and monotonic apply/ignore rules. | State-machine contract beats older incremental hydration prose. | Raw events may request projection; they must not write visible units. |
| rule-transcript-boundary-regressions | rule | Regression coverage for live assistant visibility and transcript boundary behavior. | Rule tests are required when delivery state changes. | Reducer and integration tests must cover raw-event no-op visibility. |
| rule-react-no-effects | rule | React effects as external synchronization only. | Reducer owns state transitions; effects only subscribe/fetch/dispatch. | Lifecycle effects may observe sockets but must not derive visibility ad hoc. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| chat selected/cleared | IN | Route ownership resets the delivery machine, active chat id, request token, and visible-unit cache scope. | No stale snapshot or render-window reply may apply across chat ids. | src/client/app/useTranscriptLifecycle.test.ts and ref-transcript-render-state-machine |
| snapshot received | IN | Snapshot render units apply only when projectionKey belongs to active chat and passes monotonic freshness. | Same key is ignored; same count with different hash is rejected during live delivery. | src/client/app/useTranscriptLifecycle.test.ts and src/shared/protocol.ts |
| raw transcript event | IN | Raw event coalesces pending projection refresh and never changes visible render units directly. | No incremental hydration or message-array handoff from raw event payloads. | src/client/app/useTranscriptLifecycle.test.ts |
| render-window response | IN | Response applies only for the current request token and newer projection key. | Late/stale replies and failed projections retain current visible units. | src/client/app/useTranscriptLifecycle.test.ts |
| visible units handoff | OUT | Lifecycle sends only delivery-machine-owned TranscriptRenderUnit[] to ChatTranscript. | ChatTranscript receives units, not raw entries or hydration commands. | src/client/app/ChatTranscript.test.tsx and src/client/app/useTranscriptLifecycle.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Two visual writers return | Lifecycle writes visible units from both raw events/fetches and snapshots outside the reducer. | rg in src/client/app/useTranscriptLifecycle.ts for setMessages outside delivery-machine apply path. | bun test src/client/app/useTranscriptLifecycle.test.ts |
| Stale projection flashes current chat | Late snapshot or render-window reply applies without chat id, request token, or projection key check. | Reducer tests for stale snapshot/reply ignore and chat-switch isolation. | bun test src/client/app/useTranscriptLifecycle.test.ts |
| Same-count projection drift causes loading/idle flash | Equivalent entry window changes unit shape or hash while live delivery accepts same entryCount replacement. | Projection shape-stability tests and reducer same-count/different-hash rejection tests. | bun test src/shared/transcript-render.test.ts src/client/app/useTranscriptLifecycle.test.ts |
| Projection failure blanks visible transcript | Fetch/render-window failure clears messages during a live turn. | Reducer projection.failed test. | bun test src/client/app/useTranscriptLifecycle.test.ts |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

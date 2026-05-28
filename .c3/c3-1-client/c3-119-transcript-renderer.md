---
id: c3-119
c3-seal: 3501512cd01fc60011b3d1c9258f1302cc9e99c71c5d18bd900821478f113be0
title: transcript-renderer
type: component
category: feature
parent: c3-1
goal: 'Own transcript render-unit presentation: virtualized rows, stable measurement, scroll-facing item identity, and dispatch into message renderers from already-folded TranscriptRenderUnit input.'
uses:
    - c3-106
    - c3-107
    - c3-111
    - c3-118
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - ref-transcript-render-state-machine
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

# transcript-renderer

## Goal

Own transcript render-unit presentation: virtualized rows, stable measurement, scroll-facing item identity, and dispatch into message renderers from already-folded TranscriptRenderUnit input.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own transcript-renderer behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep transcript-renderer decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Render transcript units that have already been folded by the shared projection contract. This component does not derive transcript facts, group assistant/tool boundaries, fetch or hydrate messages, decide live visibility, or reinterpret raw events. It owns presentation mechanics only: virtualized row shape, scroll measurement hooks, stable React keys, and dispatch to message/present-content/rich-content renderers.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before transcript-renderer behavior is changed. | ref-live-transcript-render-contract |
| Inputs | Accept only the files, commands, data, or calls that belong to transcript-renderer ownership. | ref-live-transcript-render-contract |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-live-transcript-render-contract |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-live-transcript-render-contract |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks transcript-renderer to deliver its documented responsibility. | ref-live-transcript-render-contract |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-live-transcript-render-contract |
| Alternate paths | When a request falls outside transcript-renderer ownership, hand it to the parent or sibling component. | ref-live-transcript-render-contract |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-live-transcript-render-contract |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-live-transcript-render-contract | ref | Provider-to-read-model-to-client transcript rendering boundaries and live transcript anti-regression expectations. | ref-transcript-render-state-machine narrows renderer ownership when live delivery is involved. | Use this for end-to-end transcript flow context. |
| ref-transcript-render-state-machine | ref | Units-only renderer boundary, stable keys, no renderer-owned grouping, and no live fade loops. | Explicit anti-flash state-machine contract beats older renderer grouping prose. | Renderer receives ready render units from the delivery machine; it must not fetch, hydrate, group, or hide transcript facts. |
| rule-transcript-boundary-regressions | rule | Regression coverage for assistant visibility, WIP/tool grouping output, and artifact rendering. | Rule tests are required whenever transcript rendering behavior changes. | Tests assert renderer consumes folded units and does not recreate grouping. |
| rule-react-no-effects | rule | React component side-effect boundaries. | Effects are not used to derive render grouping or delivery state. | Renderer remains declarative over props. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| renderUnits input | IN | Callers provide ordered TranscriptRenderUnit[] owned by the delivery machine; renderer treats unit kind/id/sourceEntryIds as authoritative. | Projection fold and delivery state machine own grouping and visibility. | src/client/app/ChatTranscript.test.tsx and src/shared/transcript-render.test.ts |
| virtual rows | OUT | Render one stable row per supplied render unit without remount-inducing id rewrites or phase-dependent regrouping. | No raw TranscriptEntry[] handling in ChatTranscript. | src/client/app/ChatTranscript.test.tsx plus agent-browser no-flash smoke |
| message dispatch | OUT | Dispatch existing unit payloads to message, rich-content, and present-content renderers without altering transcript semantics. | Message components render payloads; renderer does not infer missing facts. | src/client/components/messages/TextMessage.test.tsx and src/client/components/rich-content/RichContentBlock.test.tsx |
| animation | OUT | Do not replay fade/guard animations for already-visible stable units after equivalent live projections. | Animation may decorate first appearance only when keyed by new unit identity. | src/index.css, src/client/app/ChatTranscript.test.tsx, and agent-browser no-flash smoke |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Renderer-owned grouping returns | ChatTranscript accepts raw entries or derives assistant/tool groups. | rg in src/client/app/ChatTranscript.tsx plus src/shared/transcript-render.test.ts failures. | bun test src/shared/transcript-render.test.ts src/client/app/ChatTranscript.test.tsx |
| Stable units remount or flash | Unit ids, React keys, or animation classes change for equivalent projections. | src/client/app/ChatTranscript.test.tsx stable-key assertions and agent-browser live-turn smoke. | bun test src/client/app/ChatTranscript.test.tsx and agent-browser no-flash smoke |
| Boundary drift from lifecycle | Renderer fetches, hydrates, buffers, or filters live transcript events. | rg in src/client/app/ChatTranscript.tsx should not find fetchTranscript, subscribe, or setMessages for lifecycle work. | bun test src/client/app/useTranscriptLifecycle.test.ts src/client/app/ChatTranscript.test.tsx |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

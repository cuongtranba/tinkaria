---
id: c3-206
c3-seal: 399dd9b22aa52223f54150f0137a8c127564576b48bd9b33acf5ff55bb3be6bb
title: orchestration
type: component
category: feature
parent: c3-2
goal: SessionOrchestrator manages cross-session agent delegation, spawn/send/wait/close operations, depth and concurrency limits, and cancellation cascades.
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

# orchestration

## Goal

SessionOrchestrator manages cross-session agent delegation, spawn/send/wait/close operations, depth and concurrency limits, and cancellation cascades.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own orchestration behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep orchestration decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for orchestration so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before orchestration behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to orchestration ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks orchestration to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside orchestration ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs orchestration behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| spawnAgent | OUT | Creates a child chat, records ownership/depth, and starts its first turn through coordinator.startTurnForChat. | c3-210 agent boundary | src/server/orchestration.ts; bun test src/server/orchestration.test.ts --test-name-pattern 'spawnAgent' |
| sendInput idle target | OUT | If coordinator.activeTurns.has(targetChatId) is false, sendInput starts a new turn on the owned target child. | c3-210 agent boundary | src/server/orchestration.ts; bun test src/server/orchestration.test.ts --test-name-pattern 'calls startTurnForChat' |
| sendInput active target | OUT | If coordinator.activeTurns.has(targetChatId) is true, sendInput must queue the follow-up through coordinator.queue instead of throwing busy/already-running. | c3-210 agent boundary | src/server/orchestration.ts; bun test src/server/orchestration.test.ts --test-name-pattern 'queues input if target is already running' |
| wait and close ownership | OUT | waitForResult and closeAgent must require owned targets and update child hierarchy without bypassing coordinator cancellation/disposal. | c3-210 agent boundary | src/server/orchestration.ts; bun test src/server/orchestration.test.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Busy follow-up regression | sendInput checks only target existence and directly starts a turn while the child is active. | Codex reports Chat is already running or Target chat is already running. | bun test src/server/orchestration.test.ts --test-name-pattern 'queues input if target is already running' |
| Active-state source confusion | Troubleshooting assumes TranscriptConsumer status is the only active source. | Race reproduces only immediately after spawnAgent/startTurnForChat. | Read c3-210 Contract; bun test src/server/runner-proxy.test.ts --test-name-pattern 'activeTurns.has() returns true immediately' |
| Ownership bypass | sendInput, wait, or close accepts a target not owned by the caller. | Cross-session child operations affect unrelated chats. | bun test src/server/orchestration.test.ts --test-name-pattern 'does not own' |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

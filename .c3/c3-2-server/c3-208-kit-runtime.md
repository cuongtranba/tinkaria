---
id: c3-208
c3-seal: b3225ff1c99b30ec8bf2b905f1277b172fc34aa5ce2d8cd400fea3214db1d92b
title: kit-runtime
type: component
category: foundation
parent: c3-2
goal: 'Own the hub-to-kit execution seam for Codex turns: track stable project-to-kit assignment, bridge turn/session traffic over NATS, and run the default local long-running kit without changing the client command surface.'
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-nats-transport-hardening
    - ref-ref-jetstream-streaming
    - ref-runtime-operational-readiness
    - rule-provider-runtime-readiness
    - rule-subprocess-ipc-safety
    - rule-transcript-boundary-regressions
---

# kit-runtime

## Goal

Own the hub-to-kit execution seam for Codex turns: track stable project-to-kit assignment, bridge turn/session traffic over NATS, and run the default local long-running kit without changing the client command surface.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own kit-runtime behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep kit-runtime decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for kit-runtime so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before kit-runtime behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to kit-runtime ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks kit-runtime to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside kit-runtime ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs kit-runtime behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| start_turn command | IN | RunnerAgent receives StartTurnCommand over the runner command subject and rejects duplicate starts for chats already in its activeTurns map. | c3-210 agent boundary | src/runner/runner-agent.ts; src/runner/runner-agent.test.ts |
| status events | OUT | RunnerAgent publishes status_change events such as starting/running/waiting_for_user, but these are asynchronous observations consumed by c3-226 and cannot be the only active-state gate. | c3-226 transcript-runtime boundary | src/runner/runner-agent.ts; src/server/transcript-consumer.ts |
| final events | OUT | RunnerAgent publishes turn_finished, turn_failed, or turn_cancelled and removes active turns in finally. | c3-226 transcript-runtime boundary | src/runner/runner-agent.ts; src/runner/runner-agent.test.ts |
| Codex app-server seam | OUT | Codex app-server manager maps Codex JSON-RPC turn events into HarnessTurn transcript/session events without owning chat queue policy. | c3-216 codex boundary | src/server/codex-app-server.ts; src/server/codex-app-server.test.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Duplicate start mistaken for queue failure | RunnerAgent rejects start_turn because the hub sent a second start instead of queueing. | Error text: Chat is already running. | Read c3-210 Contract; bun test src/server/runner-proxy.test.ts --test-name-pattern 'activeTurns.has() returns true immediately' |
| Status-event timing assumption | Code assumes starting/running status_change arrives before Codex can send a follow-up tool call. | Reproduces only with immediate Codex send_input after spawnAgent. | bun test src/server/orchestration.test.ts --test-name-pattern 'queues input if target is already running' |
| Provider boundary drift | Codex app-server or runner code starts owning chat queue policy. | Queue behavior appears in src/server/codex-app-server.ts or src/runner/runner-agent.ts instead of RunnerProxy. | src/server/runner-proxy.ts; src/server/codex-app-server.ts; src/runner/runner-agent.ts |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

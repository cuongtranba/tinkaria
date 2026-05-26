---
id: c3-210
c3-seal: d27a86e5ac320bb022c262ba4b8643c691d738a6a6e7a50eb7e0cd1f0fd64b7c
title: agent
type: component
category: feature
parent: c3-2
goal: RunnerProxy and provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, transcript event flow, queued follow-up ownership, and provider handoff without leaking provider transport details across the server.
uses:
    - c3-206
    - c3-207
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-external-source-authority-boundaries
    - ref-live-transcript-render-contract
    - ref-ref-provider-abstraction
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-external-source-stale-handle-guards
    - rule-prefixed-logging
    - rule-provider-harness-boundaries
    - rule-provider-runtime-readiness
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

# agent

## Goal

RunnerProxy and provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, transcript event flow, queued follow-up ownership, and provider handoff without leaking provider transport details across the server.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own agent behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep agent decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for agent so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before agent behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to agent ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks agent to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside agent ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs agent behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| chat turn start | IN | RunnerProxy accepts chat.send/startTurnForChat and records the chat as recently started immediately after runner start_turn succeeds. | c3-2 boundary | src/server/runner-proxy.ts; src/server/runner-proxy.test.ts |
| active turn query | OUT | activeTurns.has(chatId) is the orchestration contract for busy/queue decisions and must return true for both transcript-observed active statuses and recentlyStartedChats. | c3-206 orchestration boundary | src/server/runner-proxy.ts; bun test src/server/runner-proxy.test.ts --test-name-pattern 'activeTurns.has() returns true immediately' |
| queued follow-up | OUT | chat.queue stores one coalesced queued turn when activeTurns.has is true; drainQueuedTurn clears recentlyStartedChats, waits for observed active status to disappear, then starts the queued turn. | c3-226 transcript-runtime boundary | src/server/runner-proxy.ts; bun test src/server/runner-proxy.test.ts |
| provider handoff | OUT | Provider-specific transports remain behind the runner/provider seam; queue and active-state ownership stays in RunnerProxy rather than Codex UI/tool error handling. | c3-208 kit-runtime boundary | src/server/codex-app-server.ts; src/runner/runner-agent.ts; bun test src/server/codex-app-server.test.ts src/runner/runner-agent.test.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Just-started race | A child chat is started and Codex immediately calls send_input before TranscriptConsumer observes status_change. | activeTurns.has is false even though recentlyStartedChats contains the chat; runner returns Chat is already running. | bun test src/server/runner-proxy.test.ts --test-name-pattern 'activeTurns.has() returns true immediately' |
| Queue drain recursion | activeTurns.has is implemented in terms of hasActiveOrJustStartedTurn, then drainQueuedTurn calls activeTurns.has after deleting recentlyStartedChats. | Queued turn never drains or active-state checks recurse. | src/server/runner-proxy.ts; bun test src/server/runner-proxy.test.ts --test-name-pattern 'drainQueuedTurn' |
| Ownership drift | Busy errors are handled in Codex UI/tool layer instead of server queue ownership. | sendInput throws already running/busy instead of calling coordinator.queue. | bun test src/server/orchestration.test.ts --test-name-pattern 'queues input if target is already running' |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

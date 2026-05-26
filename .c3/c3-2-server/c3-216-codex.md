---
id: c3-216
c3-seal: 3319781c2c317675c1f20c0d68af5706e1819db1b55ebd5ac34d08e9abf91389
title: codex
type: component
category: feature
parent: c3-2
goal: Codex CLI protocol wrapper that spawns the Codex app-server subprocess, communicates via JSON-RPC over stdin/stdout, advertises dynamic tools, and translates Codex events into the shared harness turn model consumed by the higher-level provider seam in c3-210.
uses:
    - c3-106
    - c3-207
    - recipe-agent-turn-render-flow
    - recipe-project-c3-app-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-mcp-app-hosting
    - ref-mcp-app-jtbd
    - ref-ref-provider-abstraction
    - ref-zod-defensive-validation
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-provider-harness-boundaries
    - rule-provider-runtime-readiness
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-subprocess-ipc-safety
    - rule-transcript-boundary-regressions
---

# codex

## Goal

Codex CLI protocol wrapper that spawns the Codex app-server subprocess, communicates via JSON-RPC over stdin/stdout, advertises dynamic tools, and translates Codex events into the shared harness turn model consumed by the higher-level provider seam in c3-210.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own codex behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep codex decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for codex so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before codex behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to codex ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks codex to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside codex ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs codex behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| codex input | IN | Callers must provide context that matches the component goal and parent fit. | c3-2 boundary | c3x lookup plus targeted tests or review. |
| codex output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-2 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

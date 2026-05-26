---
id: c3-110
c3-seal: 101620b826333f6b0f5c72b7dde79b9de426219aae95297b28eab554468e40da
title: chat
type: component
category: feature
parent: c3-1
goal: Document chat behavior within its parent container.
uses:
    - c3-108
    - recipe-agent-turn-render-flow
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-fork-session-seeding
    - ref-live-transcript-render-contract
    - ref-mcp-app-jtbd
    - ref-nats-transport-hardening
    - ref-project-c3-app-surface
    - ref-quirky-copy
    - ref-ref-jetstream-streaming
    - ref-ref-websocket-protocol
    - ref-ref-zustand-stores
    - ref-responsive-modal-pattern
    - ref-screen-composition-patterns
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

# chat

## Goal

Document chat behavior within its parent container.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own chat behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep chat decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for chat so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before chat behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to chat ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks chat to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside chat ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs chat behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |
| ref-quirky-copy | ref | Citation added by c3x wire; refine the governed behavior before review. | wired citation beats uncited local prose | Added by c3x wire. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| chat input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| chat output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

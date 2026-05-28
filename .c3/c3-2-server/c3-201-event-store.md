---
id: c3-201
c3-seal: 1f1cb8655b24f918599992db9d6f2cc97b7834d3085c952156c304dacc128f89
title: event-store
type: component
category: foundation
parent: c3-2
goal: JSONL-based append-only event log with snapshot compaction for persisting all project, chat, queued-turn, and transcript state.
uses:
    - ref-component-identity-mapping
    - ref-ref-event-sourcing
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-type-guards
---

# event-store

## Goal

JSONL-based append-only event log with snapshot compaction for persisting all project, chat, queued-turn, and transcript state.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own event-store behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep event-store decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for event-store so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before event-store behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to event-store ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks event-store to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside event-store ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs event-store behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| event-store input | IN | Callers must provide context that matches the component goal and parent fit. | c3-2 boundary | c3x lookup plus targeted tests or review. |
| event-store output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-2 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

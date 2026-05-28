---
id: c3-108
c3-seal: 10ff3d37f8cc0f1d2ad785a52037f8cba866e0469b0ded2a4b19be21e96e2df7
title: ui-identity
type: component
category: foundation
parent: c3-1
goal: Own semantic UI identity helpers plus the Alt+Shift overlay controller so interactive client surfaces expose stable `data-ui-id` hooks that map back to C3 screen/component ownership.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-identity-composition
---

# ui-identity

## Goal

Own semantic UI identity helpers plus the Alt+Shift overlay controller so interactive client surfaces expose stable `data-ui-id` hooks that map back to C3 screen/component ownership.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own ui-identity behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep ui-identity decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for ui-identity so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before ui-identity behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to ui-identity ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks ui-identity to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside ui-identity ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs ui-identity behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| ui-identity input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| ui-identity output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

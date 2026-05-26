---
id: c3-113
c3-seal: eb41784877c984eb04c6fa06aca8ec28eef53e029728ca3d4dd8b6c79a7ddbfe
title: sidebar
type: component
category: feature
parent: c3-1
goal: 'Render the persistent left sidebar: project-group navigation, chat rows, per-project menus, and resumable session picker overlays, with shared sidebar ui ids for Alt+Shift inspection.'
uses:
    - c3-108
    - ref-component-identity-mapping
    - ref-mobile-tabbed-page-pattern
    - ref-ref-radix-primitives
    - ref-ref-websocket-protocol
    - ref-responsive-modal-pattern
    - ref-screen-composition-patterns
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

# sidebar

## Goal

Render the persistent left sidebar: project-group navigation, chat rows, per-project menus, and resumable session picker overlays, with shared sidebar ui ids for Alt+Shift inspection.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own sidebar behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep sidebar decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for sidebar so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before sidebar behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to sidebar ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks sidebar to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside sidebar ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs sidebar behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| sidebar input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| sidebar output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

---
id: c3-117
c3-seal: d412d2643a62d8fb8dd7dcd4a2a868583068bd130e09e31577e089a94926d82f
title: projects
type: component
category: feature
parent: c3-1
goal: 'Render the `/` local-projects screen: connection/setup states, recent-session resume cards, project stats, workspace cards, and the add-project modal, all with semantic UI ids that map the home screen back into C3.'
uses:
    - c3-108
    - recipe-project-c3-app-flow
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-mcp-app-jtbd
    - ref-project-c3-app-surface
    - ref-responsive-modal-pattern
    - ref-screen-composition-patterns
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

# projects

## Goal

Render the `/` local-projects screen: connection/setup states, recent-session resume cards, project stats, workspace cards, and the add-project modal, all with semantic UI ids that map the home screen back into C3.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own projects behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep projects decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for projects so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before projects behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to projects ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks projects to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside projects ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs projects behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| projects input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| projects output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

---
id: c3-225
c3-seal: 4532f4f28097ec29fe1991f032dc1a2d24b5aafcfa6b7e939c4df5bbff1ad4b1
title: sandbox
type: component
category: feature
parent: c3-2
goal: Docker-based workspace isolation — create, manage, and monitor sandbox containers per workspace with health checks, NATS communication, and security constraints.
uses:
    - ref-ref-event-sourcing
    - ref-ref-websocket-protocol
    - ref-workspace-journey-test-contracts
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-journey-test-coverage
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-ui-component-usage
---

# sandbox

## Goal

Docker-based workspace isolation — create, manage, and monitor sandbox containers per workspace with health checks, NATS communication, and security constraints.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own sandbox behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep sandbox decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for sandbox so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before sandbox behavior is changed. | ref-ref-event-sourcing |
| Inputs | Accept only the files, commands, data, or calls that belong to sandbox ownership. | ref-ref-event-sourcing |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-ref-event-sourcing |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-ref-event-sourcing |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks sandbox to deliver its documented responsibility. | ref-ref-event-sourcing |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-ref-event-sourcing |
| Alternate paths | When a request falls outside sandbox ownership, hand it to the parent or sibling component. | ref-ref-event-sourcing |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-ref-event-sourcing |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-ref-event-sourcing | ref | Governs sandbox behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| sandbox input | IN | Callers must provide context that matches the component goal and parent fit. | c3-2 boundary | c3x lookup plus targeted tests or review. |
| sandbox output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-2 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

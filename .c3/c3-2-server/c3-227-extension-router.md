---
id: c3-227
c3-seal: 912e45eeb846dfc67b22a095971df0a42382a2dea893c4b15e575cf567688c48
title: extension-router
type: component
category: feature
parent: c3-2
goal: Server-side extension infrastructure — filesystem detection, route multiplexing, and three first-party extension handlers (c3 architecture via c3x CLI, agents config via file parsing, code manifests via language-specific parsers).
uses:
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
---

# extension-router

## Goal

Server-side extension infrastructure — filesystem detection, route multiplexing, and three first-party extension handlers (c3 architecture via c3x CLI, agents config via file parsing, code manifests via language-specific parsers).

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own extension-router behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep extension-router decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for extension-router so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before extension-router behavior is changed. | rule-error-extraction |
| Inputs | Accept only the files, commands, data, or calls that belong to extension-router ownership. | rule-error-extraction |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | rule-error-extraction |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | rule-error-extraction |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks extension-router to deliver its documented responsibility. | rule-error-extraction |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | rule-error-extraction |
| Alternate paths | When a request falls outside extension-router ownership, hand it to the parent or sibling component. | rule-error-extraction |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | rule-error-extraction |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| rule-error-extraction | rule | Governs extension-router behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| extension-router input | IN | Callers must provide context that matches the component goal and parent fit. | c3-2 boundary | c3x lookup plus targeted tests or review. |
| extension-router output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-2 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

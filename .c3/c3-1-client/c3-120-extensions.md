---
id: c3-120
c3-seal: ec669929a3696484a7dde1da81357cca057096d09e5dc4c3f9f936b963051fd1
title: extensions
type: component
category: feature
parent: c3-1
goal: Extension host for the Project Page — auto-detects relevant project extensions via filesystem probes, renders them as SegmentedControl tabs, and renders selected C3 entity documents as full markdown from c3x read --full. Lazy-loads extension React components (c3 architecture, agents config, code overview). User preferences (enable/disable) override detection results globally.
uses:
    - ref-mobile-tabbed-page-pattern
    - ref-ref-event-sourcing
    - ref-ref-tailwind-theming
    - ref-screen-composition-patterns
    - rule-error-extraction
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

# extensions

## Goal

Extension host for the Project Page — auto-detects relevant project extensions via filesystem probes, renders them as SegmentedControl tabs, and renders selected C3 entity documents as full markdown from c3x read --full. Lazy-loads extension React components (c3 architecture, agents config, code overview). User preferences (enable/disable) override detection results globally.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own extensions behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep extensions decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for extensions so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before extensions behavior is changed. | ref-mobile-tabbed-page-pattern |
| Inputs | Accept only the files, commands, data, or calls that belong to extensions ownership. | ref-mobile-tabbed-page-pattern |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-mobile-tabbed-page-pattern |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-mobile-tabbed-page-pattern |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks extensions to deliver its documented responsibility. | ref-mobile-tabbed-page-pattern |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-mobile-tabbed-page-pattern |
| Alternate paths | When a request falls outside extensions ownership, hand it to the parent or sibling component. | ref-mobile-tabbed-page-pattern |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-mobile-tabbed-page-pattern |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-mobile-tabbed-page-pattern | ref | Governs extensions behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| extensions input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| extensions output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

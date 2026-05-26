---
id: c3-104
c3-seal: 1233e47c33e2faed742010ec2776f2956aaafba9859e0e8f04b3ceb11c2d3055
title: ui-primitives
type: component
category: foundation
parent: c3-1
goal: Expose a library of Radix-based headless UI primitives (Button, Card, Dialog, Popover, ScrollArea, Textarea, Input, Select, Tooltip, Kbd, ContextMenu, Resizable, AppDialog, AnimatedShinyText, SegmentedControl, SettingsHeaderButton) styled with Tailwind and class-variance-authority.
uses:
    - ref-component-identity-mapping
    - ref-mobile-tabbed-page-pattern
    - ref-ref-radix-primitives
    - ref-ref-tailwind-theming
    - ref-responsive-modal-pattern
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

# ui-primitives

## Goal

Expose a library of Radix-based headless UI primitives (Button, Card, Dialog, Popover, ScrollArea, Textarea, Input, Select, Tooltip, Kbd, ContextMenu, Resizable, AppDialog, AnimatedShinyText, SegmentedControl, SettingsHeaderButton) styled with Tailwind and class-variance-authority.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own ui-primitives behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep ui-primitives decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for ui-primitives so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before ui-primitives behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to ui-primitives ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks ui-primitives to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside ui-primitives ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs ui-primitives behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| ui-primitives input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| ui-primitives output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

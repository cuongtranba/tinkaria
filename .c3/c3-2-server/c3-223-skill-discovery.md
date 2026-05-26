---
id: c3-223
c3-seal: 0b2f69df885380ad63ee689d139ca31283be7a146fa0b245d6657db5e363d8ce
title: skill-discovery
type: component
category: feature
parent: c3-2
goal: Discover skill directories from the filesystem (~/.claude/skills/ and <project>/.claude/skills/), cache results per project with configurable TTL, and provide discovered skill names to AgentCoordinator for injection into Codex system_init entries.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

# skill-discovery

## Goal

Discover skill directories from the filesystem (~/.claude/skills/ and <project>/.claude/skills/), cache results per project with configurable TTL, and provide discovered skill names to AgentCoordinator for injection into Codex system_init entries.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own skill-discovery behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep skill-discovery decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |

## Purpose

Provide durable agent-ready documentation for skill-discovery so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before skill-discovery behavior is changed. | ref-component-identity-mapping |
| Inputs | Accept only the files, commands, data, or calls that belong to skill-discovery ownership. | ref-component-identity-mapping |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-component-identity-mapping |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-component-identity-mapping |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks skill-discovery to deliver its documented responsibility. | ref-component-identity-mapping |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-component-identity-mapping |
| Alternate paths | When a request falls outside skill-discovery ownership, hand it to the parent or sibling component. | ref-component-identity-mapping |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-component-identity-mapping |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-component-identity-mapping | ref | Governs skill-discovery behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| skill-discovery input | IN | Callers must provide context that matches the component goal and parent fit. | c3-2 boundary | c3x lookup plus targeted tests or review. |
| skill-discovery output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-2 boundary | c3x check and project test suite. |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |

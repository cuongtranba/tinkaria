---
id: rule-c3-ref-rule-detail-quality
c3-seal: c4bd9057ad558695c4ee1b6288494e9d3680ebba53e01388fca5ee1c3c42fd33
title: c3-ref-rule-detail-quality
type: rule
goal: Keep architecture refs and rules actionable enough that C3 lookup can enforce behavior instead of returning vague background notes.
---

## Goal

Keep architecture refs and rules actionable enough that C3 lookup can enforce behavior instead of returning vague background notes.

## Rule

Every new or materially updated ref/rule must be written as an enforcement artifact:

- Refs must state Goal, Choice, Why, and How. `How` must name the concrete implementation pattern, ownership boundary, and verification path.
- Rules must state Goal, Rule, Golden Example, Not This, Scope, and Override when exceptions are possible.
- Avoid empty role cells, stale product names, duplicated prose, and historical names unless they refer to real protocol constants or historical ADR facts.
- If a ref/rule controls code behavior, add codemap patterns or wire it to the components that should inherit it through lookup.
- If a doc uses a term future maintainers will search for, include that term in Goal or Rule rather than burying it in examples only.

## Golden Example

A render-flow ref names the boundary (`transcript lifecycle -> renderer -> message surface`), the concrete code (`parseTranscript`, `ChatTranscript.groupMessages`, `PresentContentMessage`), and the proof (`ChatTranscript.test.tsx`, `parseTranscript.test.ts`, `c3x lookup`).

## Not This

- Goal-only refs with no How.
- Rules that prohibit behavior but do not show a correct pattern.
- References that say “use shared helpers” without naming the helper or owning component.
- Codemap-free behavioral rules that future code changes cannot discover through `c3x lookup`.
- Stale rebrand terms in active docs except real legacy constants such as `KANNA_*` stream names.

## Scope

Applies to active C3 refs and rules. Historical ADRs may preserve old terminology when describing past decisions.

## Override

Provisioned refs may stay lighter only while explicitly marked `provisioned`; before activation they must meet this rule.

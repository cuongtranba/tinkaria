---
id: adr-20260411-workspace-architecture-spec-constraints
c3-seal: c77355473da2ccd3cc484cbb18b6c4a3d805ea7d6064460c85ab5206bee37f47
title: workspace-architecture-spec-constraints
type: adr
goal: Tighten the workspace architecture spec so it reflects the intended repo-scoped chat/session model, explicit repo archive behavior, browser-first constraints, and the true scope of the project-to-workspace transition before implementation planning.
status: proposed
date: "2026-04-11"
---

## Goal

Tighten the workspace architecture spec so it reflects the intended repo-scoped chat/session model, explicit repo archive behavior, browser-first constraints, and the true scope of the project-to-workspace transition before implementation planning.

## Work Breakdown

- Review the current spec language that leaves workspace-vs-repo scope ambiguous.
- Update the spec to make repo-scoped chat/session rules explicit, constrain workspace-level chats to admin/support flows, and define repo removal/archive behavior.
- Reframe the approach and sandbox notes so they match the real system seams and browser-first direction.

## Risks

- Overstating rename-in-place could hide material protocol/runtime work in the implementation plan.
- Leaving chat/session scope ambiguous could produce conflicting read-model and runtime assumptions.
- Overclaiming sandbox readiness could distort phase ordering.

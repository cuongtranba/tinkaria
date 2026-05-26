---
id: adr-20260412-workspace-journey-ux
c3-seal: 6add345fe5d2794975a39490d1820b9fdf9dc9c9e5bf8b0339e41b88cacc13ad
title: workspace-journey-ux
type: adr
goal: Define UX journey recipes, update screen-tree, add enforcement refs/rules, and establish test contracts for the workspace coordination page (/workspace/:id) — covering task coordination, file ownership, isolated development, and automation/monitoring journeys.
status: proposed
date: "2026-04-12"
---

## Goal

Define UX journey recipes, update screen-tree, add enforcement refs/rules, and establish test contracts for the workspace coordination page (/workspace/:id) — covering task coordination, file ownership, isolated development, and automation/monitoring journeys.

## Context

The workspace page has 8 panels (Todos, Claims, Worktrees, Rules, Repos, Agents, Workflows, Sandbox) but no journey documentation, no screen-tree coverage, and no journey-based test contracts. Existing journey-verification (c3-224) covers only homepage→chat. The new workspace features need the same treatment.

## Affects

- recipe-client-screen-tree (add workspace page surfaces)
- c3-224 journey-verification (extend with workspace journeys)
- c3-209 coordination (journey coverage)
- c3-225 sandbox (journey coverage)
- New: recipe-workspace-task-coordination-journey
- New: recipe-workspace-file-ownership-journey
- New: recipe-workspace-isolated-dev-journey
- New: recipe-workspace-automation-journey
- New: ref-workspace-journey-test-contracts
- New: rule-journey-test-coverage

## Work Breakdown

1. Create 4 journey recipes in C3
2. Update recipe-client-screen-tree with workspace page surfaces
3. Create ref for journey test contracts
4. Create rule for journey-based test enforcement
5. Wire everything to affected components

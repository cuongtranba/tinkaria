---
id: adr-20260415-project-homepage-session-hub
c3-seal: 1df59d7c1cb3f35e0a7193866b53ee27210407ac3a8ba85ade8e4b1584232a2b
title: project-homepage-session-hub
type: adr
goal: 'Transform ProjectPage from extensions-only to a session management hub with two tabs: Sessions (default) and Extensions.'
status: proposed
date: "2026-04-15"
---

## Goal

Transform ProjectPage from extensions-only to a session management hub with two tabs: Sessions (default) and Extensions.

## Context

The /project/:groupKey page currently only shows detected extensions. It should be the primary session management surface showing all project chats with status, actions (fork, merge, rename, archive, delete), and an archived section.

## Decision

- Add top-level SegmentedControl with Sessions | Extensions tabs, Sessions as default
- Client-only archive via zustand persist store (no server changes)
- Reuse CoordinationPanel primitives for session list layout
- Session data from existing sidebarData.workspaceGroups

## Affected Components

- c3-117 (projects) — gains session management panel, top-level tab control
- c3-120 (extensions) — unchanged, moves into Extensions tab branch

## Changes

- NEW: src/client/stores/archivedSessionsStore.ts
- NEW: src/client/components/project/ProjectSessionsPanel.tsx
- MODIFY: src/client/app/ProjectPage.tsx

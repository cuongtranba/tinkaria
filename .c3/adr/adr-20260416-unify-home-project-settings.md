---
id: adr-20260416-unify-home-project-settings
c3-seal: 33ed8527d545a9abcc8c2c71d8bcc2c77c013376772e7d1ea530f44cb972706c
title: unify-home-project-settings
type: adr
goal: Change home page to match project homepage structure, allow project management from home, link into project pages, show brief running sessions, and consolidate scattered settings into one place.
status: implemented
date: "2026-04-16"
---

## Goal

Change home page to match project homepage structure, allow project management from home, link into project pages, show brief running sessions, and consolidate scattered settings into one place.

## Work Breakdown

- Convert connected `home.page` into a compact project-page-style tabbed surface: Projects, Workspaces, Settings.
- Route project card primary actions to `/project/:groupKey` when sidebar project identity exists, while preserving fallback task start for unmatched discovered projects.
- Preview the two most relevant project sessions on home cards and overview panels.
- Move homepage preferences and Tinkaria settings into the home Settings tab via a shared `TinkariaSettingsPanel`.
- Point sidebar footer settings and legacy `/settings` routes at `/?tab=settings`.

## Risks

- Home routes can lose query-state if tab changes overwrite unrelated params.
- Project summaries can drift from sidebar project identity when local-workspaces and sidebar snapshots differ.
- Settings panel reuse can duplicate settings surfaces unless old routes become compatibility entry points.

## Parent Delta

- Component: c3-117 projects behavior changed by adding home tabs, project-page links, and session previews. Evidence: `src/client/components/LocalDev.tsx`, `src/client/app/LocalWorkspacesPage.tsx`, `src/client/app/SettingsPage.tsx`.
- Component: c3-113 sidebar behavior changed only for footer settings target. Evidence: `src/client/app/AppSidebar.tsx`.
- Container: c3-1 already owns project management and settings UI; no container responsibility change needed.
- Context: no topology change.
- Refs/Rules: no shared ref/rule change; changes comply with browse/card vocabulary, UI primitives for buttons, and C3 ui identity descriptors.

## Verification Plan

- RED/GREEN focused tests for home tabs, project links/session previews, settings merge, sidebar settings link, and legacy redirects.
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`.
- C3 check and `git diff --check`.
- Browser smoke with `axi` against Vite dev server.

# 0006 Independent Workspace Management (rename, delete, pin, reorder)

Date: 2026-05-25

## Status

Accepted

## Context

Independent workspaces (the `Boxes`-icon entries such as "news" / "Working",
distinct from local project repos) could only be **created**. The
`independent-workspace.create` command, `independent_workspace_created` event,
and a `NewWorkspaceModal` exist. A `handleDeleteWorkspace` client handler and
`independent-workspace.delete` command also exist, but **no UI control ever
calls delete** — it is orphaned. There is no rename and no ordering: the list is
returned in `Map` insertion order with no user control.

The user asked to "manage workspaces": rename, delete, and reorder/pin, exposed
on **both** the home dashboard "Workspaces" tab cards and the left-sidebar
workspace rows.

Workspace state is event-sourced in `EventStore` (`projects.log`), projected
into `independentWorkspacesById`, serialized into the snapshot, and pushed to the
client via `SidebarData.independentWorkspaces`.

## Decision

1. Extend `IndependentWorkspace` with two **optional** fields — `pinned?: boolean`
   and `sortOrder?: number` — keeping existing persisted snapshots/events valid
   (no migration; absent = unpinned, undefined order).
2. Add three event types to `WorkspaceEvent`:
   `independent_workspace_renamed`, `independent_workspace_pin_toggled`,
   `independent_workspaces_reordered`.
3. Add three `ClientCommand` variants: `independent-workspace.rename`,
   `independent-workspace.set-pinned`, `independent-workspace.reorder`.
4. `listIndependentWorkspaces()` sorts **pinned first, then `sortOrder` asc,
   then `createdAt` asc** so both surfaces render a consistent order.
5. **Reorder UX = "Move up / Move down"** menu actions, not drag-and-drop.
   Rationale: deterministic, accessible, identically reusable on both surfaces,
   and verifiable in tests; drag-and-drop is deferred as an enhancement.
6. Delete reuses the existing confirm-guarded `handleDeleteWorkspace`.

## Consequences

- New client→server contract surface (3 commands) — internal protocol only.
- Reorder persists an explicit `sortOrder` for every workspace in the list when
  a move occurs (full-list rewrite event), avoiding sparse-index drift.
- Deletion remains destructive but stays behind the existing confirm dialog.
- C3 architecture docs are **not** updated for this change: C3 has no database
  (393 legacy markdown files, v8 skill requires a DB) and the user authorized
  proceeding without the mandated C3 flow for this feature.

## Verification

`bun test` for event-store rename/pin/reorder projection + sort; typecheck;
browser-harness end-to-end on both surfaces (rename, pin reorders list, move
up/down, delete removes). See `docs/stories/workspace-management/validation.md`.

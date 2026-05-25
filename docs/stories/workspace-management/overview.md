# Overview

## Current Behavior

Independent workspaces can only be **created**. Delete exists in the backend +
client handler but is wired to no UI control. There is no rename and no ordering
control; workspaces render in `Map` insertion order.

## Target Behavior

From both the home "Workspaces" tab cards and the left-sidebar workspace rows, a
user can:

- **Rename** a workspace (inline edit).
- **Delete** a workspace (existing confirm dialog).
- **Pin / Unpin** a workspace (pinned sort to the top).
- **Move up / Move down** to reorder.

Order is consistent across both surfaces: pinned first, then explicit
`sortOrder`, then creation time.

## Affected Users

- Single local user of the Tinkaria web UI.

## Affected Product Docs

- `docs/feature-inventory.md` (#37–39 Workspaces/Projects surface)
- `docs/decisions/0006-workspace-management.md`

## Non-Goals

- Drag-and-drop reordering (deferred; move up/down ships now).
- Managing workspace *contents* (agents/repos/workflows already have panels).
- Renaming/reordering local **project** repos (separate `project.*` surface).

# Design

## Domain Model

`IndependentWorkspace` (`src/shared/types.ts`) gains two optional fields:

```ts
pinned?: boolean      // default false
sortOrder?: number    // lower renders higher; undefined sorts last
```

Optional = existing persisted snapshots and events remain valid (no migration).

## Application Flow

New `EventStore` methods (`src/server/event-store.ts`), each appending one event
to `projects.log`:

- `renameIndependentWorkspace(workspaceId, name)` → `independent_workspace_renamed`
- `setIndependentWorkspacePinned(workspaceId, pinned)` → `independent_workspace_pin_toggled`
- `reorderIndependentWorkspaces(orderedWorkspaceIds)` → `independent_workspaces_reordered`

All three throw `"Independent workspace not found"` for an unknown id (reorder
validates every id). Projection handlers set the field(s) and bump `updatedAt`;
reorder assigns `sortOrder = index` across the provided list.

`listIndependentWorkspaces()` returns a **sorted** copy:
`pinned desc → sortOrder asc (undefined last) → createdAt asc`.

## Interface Contract

`ClientCommand` (`src/shared/protocol.ts`):

```ts
| { type: "independent-workspace.rename"; workspaceId: string; name: string }
| { type: "independent-workspace.set-pinned"; workspaceId: string; pinned: boolean }
| { type: "independent-workspace.reorder"; orderedWorkspaceIds: string[] }
```

`nats-responders.ts` maps each to its store method; rename/set-pinned return
`undefined`, reorder returns `undefined`. Errors propagate as command errors
(surfaced via `setCommandError`).

Client handlers (`useChatCommands.ts`, exposed through `useAppState.ts`):
`handleRenameWorkspace`, `handleTogglePinWorkspace`, `handleReorderWorkspaces`,
plus existing `handleDeleteWorkspace`.

## Data Model

Event-sourced; no SQL. New fields are additive/optional. Reorder writes a
full-list `orderedWorkspaceIds` event (rewrites every `sortOrder`) to avoid
sparse-index drift.

## UI / Platform Impact

- **Sidebar** `WorkspacesSection.tsx`: each row gets a right-click `ContextMenu`
  (Rename / Pin·Unpin / Move up / Move down / Delete), reusing the radix
  `ContextMenu` primitives used by project `Menus.tsx`. Move up/down disabled at
  list ends. Rename is inline edit-in-place.
- **Home** `LocalDev.tsx` `WorkspaceCard`: a hover `⋯` `DropdownMenu` with the
  same actions. Rename inline.
- Move up/down compute the new `orderedWorkspaceIds` from the current sorted
  list and call `handleReorderWorkspaces`.

## Observability

Existing event log is the audit trail (new event types are self-describing).
No new logs required.

## Alternatives Considered

1. **Drag-and-drop reorder** — expected UX but more code and non-deterministic
   to test; deferred (see decision 0006).
2. **Per-item `sortOrder` patch** instead of full-list rewrite — rejected;
   sparse indices drift and complicate insert-between semantics.
3. **Client-only sort preference** — rejected; order must persist across
   reloads and both surfaces, so it belongs in the event-sourced projection.

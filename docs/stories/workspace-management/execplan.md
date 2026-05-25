# Exec Plan

## Goal

Let a user rename, delete, pin, and reorder independent workspaces from both the
home "Workspaces" tab and the sidebar.

## Scope

In scope:

- `pinned?` + `sortOrder?` on `IndependentWorkspace`.
- 3 events, 3 commands, 3 responder cases, 3 store methods, sorted list.
- 3 client handlers + wiring of existing delete.
- Context menu on sidebar rows; ⋯ menu on home cards (Rename/Pin/Move/Delete).

Out of scope:

- Drag-and-drop reorder.
- Project-repo management; workspace content panels.

## Risk Classification

Risk flags: Data model, Public contracts, Existing behavior, Multi-domain.

Hard gates: Data loss (delete wired to UI — mitigated by existing confirm dialog).

## Work Phases

1. Discovery — done (model + flow mapped).
2. Design — done (design.md, decision 0006).
3. Validation planning — see validation.md.
4. Implementation — vertical slices:
   - S1 backend rename (event+projection+emit+protocol+responder+client) + test.
   - S2 backend pin + sort + test.
   - S3 backend reorder (move up/down) + test.
   - S4 sidebar UI (context menu).
   - S5 home card UI (⋯ menu).
5. Verification — typecheck, bun test, browser-harness both surfaces.
6. Harness update — story update, trace, matrix rows.

## Stop Conditions

Pause for human confirmation if:

- Reorder UX must be drag-and-drop after all.
- Delete should drop the confirm dialog (would weaken validation).
- Persisted snapshot shape needs a breaking change.

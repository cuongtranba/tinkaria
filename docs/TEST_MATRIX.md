# Test Matrix

This file maps product behavior to proof.

No product behavior has been defined or implemented yet. Do not mark a row
implemented until tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-workspace-management | Rename independent workspace | yes | yes | yes | n/a | implemented | event-store test + browser-harness (home + sidebar); `independent_workspace_renamed` |
| S-workspace-management | Delete independent workspace (confirm) | n/a | yes | yes | n/a | implemented | browser-harness confirm-dialog delete (home + sidebar); `independent_workspace_deleted` |
| S-workspace-management | Pin/unpin sorts workspace to top | yes | yes | yes | n/a | implemented | event-store test + browser-harness (pin icon + top, both surfaces); `independent_workspace_pin_toggled` |
| S-workspace-management | Move up/down reorders (persists) | yes | yes | yes | n/a | implemented | event-store reload test + browser-harness move up; `independent_workspaces_reordered` |
| S-workspace-management | listIndependentWorkspaces sort: pinned→sortOrder→createdAt | yes | n/a | n/a | n/a | implemented | event-store sort test; shared `compareIndependentWorkspaces` used by read-model too |
| S-preview-touched-files | Touched-files list derived from render units (dedup by path, latest wins; created vs edited; ignores read_file) | yes | n/a | yes | n/a | implemented | touchedFiles.test.ts (9) + browser-harness sidebar "Touched files (8)", all Created, most-recent-first |
| S-preview-touched-files | Extension→renderer mapping (md/html/svg/mmd/d2/pug + code fallback + binary/unsupported) | yes | n/a | yes | n/a | implemented | previewRenderer.test.ts (13) + browser-harness rendered all 8 types in modal (md/html/svg/mmd/d2-source/pug/ts/png-unsupported) |
| S-preview-touched-files | "Open" on write/edit card opens fresh-from-disk preview in modal | yes | n/a | yes | n/a | implemented | browser-harness: write_file AND edit_file cards both show always-visible "Open preview"; edit_file opened fresh edited content (post-edit "Third item"). Unit: ToolCallMessage.test.ts (write/edit show affordance, bash does not) |
| S-preview-touched-files | RightSidebar "Touched files (N)" lists session files and opens same modal | n/a | n/a | yes | n/a | implemented | browser-harness: Cmd+B opened sidebar, "Touched files (8)"; after edit, sample.md relabeled Edited + moved to top (dedup/latest-wins); clicking opens preview |
| S-preview-touched-files | Missing/too-large/binary file → graceful state (not garbled) | yes | n/a | yes | n/a | implemented | binary (.png→"Preview unavailable") + missing (deleted file → "Path not found" toast, no crash) verified in-app; unit covers unsupported. NOTE: >256KB shares the same toast error path, not separately driven |
| S-preview-touched-files | Per-card "Open preview" affordance reachable on mobile (always-visible header, not hover-gated) | yes | n/a | yes | n/a | implemented | Fix: moved button from per-card expandedContent (hover-only chevron) to always-visible ExpandableRow headerAction. browser-harness @390px: button on-screen, tap opened markdown modal. Unit: ToolCallMessage.test.ts |
| S-preview-touched-files | RightSidebar panel reachable on mobile (touch) | n/a | n/a | n/a | no | planned | sidebar still opens via Cmd+B only (no touch toggle); per-card button is the mobile entry point. Follow-up: add a visible sidebar toggle |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.

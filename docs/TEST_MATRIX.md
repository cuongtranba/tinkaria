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
| mobile-composer-menu | ≤767px: composer controls collapse into a single icon-only trigger INSIDE the input pill (no bottom toolbar row) | yes | n/a | yes | yes | implemented | unit: useIsMobile=true → menu.action present (aria-label carries model), provider/reasoning.action absent; browser-harness @390px (prod build :3210): icon left-inside the input pill, bottom row gone (trigger placement=in-pill-row), tap opens drill-in; @1200px desktop chip row returns as separate row |
| mobile-composer-menu | Trigger reflects active mode (Plan Mode blue/ListTodo; Codex Fast Mode emerald), defaults neutral | yes | n/a | yes | n/a | implemented | unit asserts text-blue (planMode) + text-emerald (codex fastMode); browser-harness: selecting Plan Mode added text-blue + ListTodo icon |
| mobile-composer-menu | Tap trigger → level-1 menu lists category rows (Provider/Model/Reasoning/Context-or-FastMode/Mode) with current value subtext | n/a | n/a | yes | n/a | implemented | browser-harness: popover text "Provider/Claude · Model/Opus · Reasoning/High · Context/200k · Mode/Full Access · Skills/Shown" (popover closed in SSR, so unit n/a) |
| mobile-composer-menu | Skills is a level-1 toggle row (no drill-in); tap flips ribbon + closes menu | n/a | n/a | yes | n/a | implemented | browser-harness: tap Skills → menu closed; reopen shows "Skills/Hidden" (was Shown) |
| mobile-composer-menu | Category row drills into level-2 (options + back arrow); back returns to level-1 | n/a | n/a | yes | n/a | implemented | browser-harness: Reasoning → "← Reasoning" + Low/Medium/High/Max; Model → Opus/Sonnet/Haiku; Mode → Full Access/Plan Mode |
| mobile-composer-menu | Selecting a level-2 option applies change and closes the whole menu | n/a | n/a | yes | n/a | implemented | browser-harness: select Medium → menu closed; reopen shows Reasoning/Medium; same state reflected in desktop row after resize |
| mobile-composer-menu | Desktop ≥768px chip row unchanged (live responsive switch) | yes | n/a | yes | yes | implemented | unit: useIsMobile=false renders full row, no menu.action; browser-harness resize 1200px → provider.action returns, menu.action gone |

| html-preview-fullscreen-contrast | Full-screen HTML preview iframe fills viewport height (not fixed 420px); inline embeds stay 420 | yes | n/a | yes | yes | implemented | EmbedRenderer fillHeight prop from LocalFilePreviewContent; browser-harness prod :3210 iframe `h-[calc(100dvh-8rem)]` 872/1000px; inline default 420 |
| html-preview-fullscreen-contrast | Self-contained HTML renders in its own theme (document body bg/padding/font preserved) | yes | n/a | yes | n/a | implemented | DEFAULT_EMBED_STYLE :where() zero-specificity; browser-harness: light #fafafa bg + dark readable text (was dark-on-dark); 160 rich-content/messages tests green |

| code-block-whitespace | Language-less code fences (ASCII art) render preformatted (whitespace-pre, monospace, horizontal scroll), not wrapped like inline code | yes | n/a | yes | yes | implemented | markdownComponents.code isInline now requires single-line; browser-harness @668px: 3 ASCII blocks whiteSpace=pre (was normal), aligned; typescript highlighting preserved; 75 messages tests |

| mermaid-insecure-context | Mermaid diagrams render over HTTP-on-IP (insecure context), not only localhost/HTTPS | yes | n/a | yes | yes | implemented | crypto.randomUUID()→generateUUID() in MermaidDiagram; browser-harness on http://100.125.230.68:3210 (isSecureContext=false): renders SVG (was "Diagram render error"); 85 tests + typecheck 0 |

| mobile-artifact-controls-split | Mobile artifact card: copy+fullscreen on top edge, only expand on bottom edge | yes | n/a | yes | yes | implemented | RichContentBlock controls split; browser-harness @668px mermaid card: top=[zoom,Copy,Open in overlay], bottom=[Expand]; desktop unchanged; 85 tests + typecheck 0 |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.

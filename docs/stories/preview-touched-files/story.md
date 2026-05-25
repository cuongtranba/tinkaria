# S-preview-touched-files — Preview files the agent touched, from chat

## Status

planned

## Lane

normal

## Product Contract

A user reviewing an agent turn must be able to open and read any file the agent
**created or edited** during the session, directly from the chat, without
leaving the app or opening an external editor. The preview renders the file's
**current on-disk content** with the right viewer for its type (markdown, HTML,
SVG, Mermaid, D2, Pug) and falls back to a syntax-highlighted code view for
everything else, so the typical "agent wrote a plan, asks me to review before
proceeding" flow is friction-free.

## Relevant Product Docs

- `docs/decisions/0006-workspace-management.md` (workspace `localPath` context)
- (no product/ doc area exists yet for chat rendering; this story is the durable contract)

## Acceptance Criteria

- Every `write_file` and `edit_file` tool-call card shows an "Open" affordance
  that opens the touched file in the preview modal.
- A "Touched files (N)" section appears in the existing RightSidebar, listing
  every created/edited file for the session, **deduped by path** (latest
  occurrence wins), each labeled created/written vs edited, each opening the
  same preview modal. The list updates live as the agent touches more files.
- Preview content is read **fresh from disk** via the existing
  `system.readLocalFilePreview` command (not the tool-call snapshot).
- File type is chosen by extension: `.md/.markdown`→markdown, `.html/.htm`→HTML
  (rendered), `.svg`→SVG, `.mmd/.mermaid`→Mermaid, `.d2`→D2, `.pug`→Pug; any
  other extension renders as syntax-highlighted code. Rich types route through
  the existing `EmbedRenderer` (sandboxed iframe).
- A deleted/moved file shows a graceful "file no longer exists" state; a file
  over the 256KB cap surfaces the existing too-large error; a binary/image file
  shows "preview unavailable for this file type" rather than garbled text.
- Works at both mobile and desktop viewports (RightSidebar already handles the
  responsive split + swipe).

## Design Notes

- **Commands:** none new. Reuse `system.readLocalFilePreview` unchanged.
- **Queries:** none new. Touched-files list is **derived client-side** from the
  in-memory transcript render units (scan for `write_file`/`edit_file`
  `toolKind`, collect `filePath`, dedup by path, latest wins).
- **API:** no protocol change. No new server capability; no new path scoping
  (explicit scope decision — see Open Questions resolved in design dialog).
- **Tables:** none.
- **Domain rules:** `write_file` → "created/written", `edit_file` → "edited".
  `edit_file` "Open" reads the **whole current file** from disk, not the
  old/new diff. `read_file` is out of scope (only created/edited files).
- **UI surfaces:**
  - `src/client/components/messages/LocalFilePreviewDialog.tsx` /
    `LocalFilePreviewContent` — extend extension→renderer inference to cover
    HTML + embed formats (currently only markdown/svg/code).
  - `src/client/components/chat-ui/RightSidebar.tsx` — replace the "diffs
    coming soon" placeholder with the "Touched files" section.
  - `src/client/components/messages/ToolCallMessage.tsx` /
    `FileContentView.tsx` — per-card "Open" affordance on write/edit cards.
  - New client util to derive the touched-files list from render units.
  - Reuse `ContentOverlay` (modal shell) and `EmbedRenderer` (renderers).

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Touched-files derivation util: dedup-by-path/latest-wins, created vs edited labeling, ignores read_file. Extension→renderer mapping covers md/html/svg/mmd/d2/pug + code fallback + binary/unsupported. |
| Integration | n/a — no new server/responder behavior (existing `system.readLocalFilePreview` already covered). |
| E2E | browser-harness: agent writes a `.md` plan → "Open" on the card renders markdown in the modal; RightSidebar "Touched files" lists it and opens the same modal; an `.html` file renders in the sandboxed iframe; a deleted file shows the missing-file state. Dual-signal: screenshot + server/runner stdout agree. |
| Platform | Sidebar section + modal usable at mobile viewport (≤767px) and desktop. |
| Release | n/a |

## Harness Delta

None planned. If transcript pagination/truncation turns out to drop old touched
files from the client-derived list, record the friction with
`scripts/harness backlog add` rather than silently adding a server read-model.

## Evidence

Pending implementation — add browser-harness screenshots + log slices to
`implementation-notes.html` and link here after validation.

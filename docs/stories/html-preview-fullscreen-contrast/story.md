# html-preview-fullscreen-contrast — Full-height HTML preview + faithful document theme

## Status

implemented

## Lane

normal

## Product Contract

When previewing a self-contained HTML file in the full-screen content viewer
(e.g. an agent-authored `*.html` opened from a write/edit card or the Touched
Files list), the rendered page must (1) fill the available viewer height
instead of a fixed short box, and (2) display in the document's own theme/colors
rather than being washed out by the app's surface.

## Relevant Product Docs

- `.c3/c3-1-client/c3-107-rich-content.md` (rich-content rendering)
- `.c3/c3-1-client/c3-111-messages.md` (LocalFilePreviewDialog)

## Acceptance Criteria

- In the full-screen preview overlay, an HTML embed iframe fills the viewport
  height (`h-[calc(100dvh-8rem)]`), not the fixed `h-[420px]` used inline.
- Inline transcript embeds (PresentContentMessage, RichContentBlock) keep the
  fixed `h-[420px]` — unchanged.
- A full HTML document's own `body` styles (background, padding, font) are
  preserved; the injected embed base style no longer overrides them.
- Standalone HTML fragments still receive the base fallback (transparent bg,
  padding, font) so they blend with the app.

## Design Notes

- Contrast: `EmbedRenderer.DEFAULT_EMBED_STYLE` rewritten with `:where()`
  zero-specificity selectors so a document's own `body{…}` rules always win.
  Root cause: the base style was injected after the document's `<style>` with
  equal specificity, so `body{background:transparent}` overrode the document's
  `background:#fafafa`, leaving dark text on the app's dark surface.
- Height: added an explicit `fillHeight` prop to `EmbedRenderer` → `HtmlEmbed`
  (and `PugEmbed`). `LocalFilePreviewContent` (the full-screen file preview)
  passes `fillHeight`. A context-based signal was rejected: `RichContentBlock`
  reuses the same `children` element for both its inline body and its overlay
  under one `ContentViewerContext.Provider`, so context cannot distinguish
  inline vs full-screen. The explicit prop is deterministic.
- UI surfaces: `src/client/components/rich-content/EmbedRenderer.tsx`,
  `src/client/components/messages/LocalFilePreviewDialog.tsx`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | rich-content + messages suites green (160 tests); typecheck exit 0. |
| E2E | browser-harness on the Symphony-check HTML preview (prod build :3210): iframe class `h-[calc(100dvh-8rem)]`, 872/1000px tall (was 420), light theme renders dark-on-light readable; inline embeds remain 420 (unchanged, fillHeight defaults false). |
| Platform | Verified in the full-screen ContentOverlay; width-agnostic. |

## Harness Delta

Intake + story recorded; TEST_MATRIX rows added.

## Evidence

browser-harness screenshots /tmp/fix-10-filled.png (fill + contrast); iframe
class + geometry assertions captured in session.

## Known follow-up

The rich-content "Open in overlay" path (`RichContentBlock` → `ContentOverlay`)
reuses the same inline `children`, so an HTML opened that way still uses the
inline 420px height. The reported path (file preview) is fixed. A shared-children
refactor would be needed to make that path fill too.

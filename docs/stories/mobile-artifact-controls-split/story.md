# mobile-artifact-controls-split — Split artifact controls across top/bottom edges on mobile

## Status

implemented

## Lane

normal

## Product Contract

On mobile, a card-chrome artifact block (RichContentBlock) must place its
view/action controls (copy, fullscreen, and the embed zoom toolbar) on the
**top edge** (in the header), and place **only the expand toggle** on the
**bottom edge**. Previously all three (copy, expand, fullscreen) were crowded on
the bottom edge, which read poorly.

## Acceptance Criteria

- Mobile card header (top edge): Copy + Open-in-overlay (fullscreen), plus the
  embed zoom/render toolbar for diagram/html embeds.
- Mobile card footer (bottom edge): Expand/Collapse toggle only.
- Desktop layout unchanged (all controls in the header, hover-revealed).
- Non-card chrome (floating controls) unchanged.

## Design Notes

- `RichContentBlock` previously built one `controls` group and rendered it whole
  in the mobile footer. Split into composable pieces (`viewerToolbarControl`,
  `copyControl`, `expandControl`, `fullscreenControl`); desktop uses the combined
  `controls`, mobile uses `mobileTopControls` (zoom+copy+fullscreen) in the header
  and `mobileBottomControls` (expand) in the footer.
- UI surface: `src/client/components/rich-content/RichContentBlock.tsx`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | rich-content suite green (85); typecheck 0. |
| E2E | browser-harness @668px on a mermaid artifact card: top-edge control group = [show rendered, show source, zoom out/reset/in, Copy, Open in overlay]; bottom-edge group = [Expand content]. |
| Platform | Mobile (≤767px). |

## Evidence

browser-harness DOM assertion + /tmp/artifact-controls-2.png.

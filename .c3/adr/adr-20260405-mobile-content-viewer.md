---
id: adr-20260405-mobile-content-viewer
c3-seal: 7edf35f09e5ab8d5ea418a68d7de80c169c1c7d4dc2b80db9dbb6f0ffe83f79a
title: mobile-content-viewer
type: adr
goal: Replace the centered Radix Dialog overlay with a responsive fullscreen content viewer on mobile (<768px). Desktop behavior unchanged. Introduces a ContentViewerContext for shared state between a contextual toolbar and content renderers, enabling type-specific controls (line numbers for code, unified/split for diff, render/source + zoom for embeds, TOC for markdown).
status: proposed
date: "2026-04-05"
---

## Goal

Replace the centered Radix Dialog overlay with a responsive fullscreen content viewer on mobile (<768px). Desktop behavior unchanged. Introduces a ContentViewerContext for shared state between a contextual toolbar and content renderers, enabling type-specific controls (line numbers for code, unified/split for diff, render/source + zoom for embeds, TOC for markdown).

### Affected Components

- c3-111 (messages) — renderers consume ContentViewerContext
- c3-104 (ui-primitives) — dialog.tsx gets mobile fullscreen variant
- c3-110 (chat) — parent page, no direct changes

### New Files

- src/client/lib/useIsMobile.ts
- src/client/components/rich-content/ContentViewerContext.ts
- src/client/components/rich-content/ViewerToolbar.tsx

### Modified Files

- src/client/components/rich-content/ContentOverlay.tsx
- src/client/components/rich-content/EmbedRenderer.tsx
- src/client/components/ui/dialog.tsx

### Decision

Keep Radix Dialog as modal primitive for both modes (preserves focus trap, a11y, portal, focus restore). Mobile fullscreen via responsive CSS class swap on DialogContent. Viewer model context enables toolbar without changing consumer prop interfaces.

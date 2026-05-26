---
id: adr-20260409-uplevel-message-controllers
c3-seal: 76d4a0a7bdcd611ff444f2a10be3107740adc6a31c46c2880c55aa98533f5388
title: uplevel-message-controllers
type: adr
goal: Eliminate the "box in box" controller pattern in RichContentBlock by hoisting all situational controls (embed render/source toggle, zoom, copy) from inner content wrappers to the outermost block header as icon buttons. On mobile, the entire control bar relocates to the bottom edge for thumb reachability.
status: proposed
date: "2026-04-09"
---

## Goal

Eliminate the "box in box" controller pattern in RichContentBlock by hoisting all situational controls (embed render/source toggle, zoom, copy) from inner content wrappers to the outermost block header as icon buttons. On mobile, the entire control bar relocates to the bottom edge for thumb reachability.

## Decision

- **Unified header controls**: RichContentBlock renders all controls (type-specific + universal) as icon buttons in a single header bar (desktop) or bottom bar (mobile)
- **Embed controls hoisted**: Render/Source toggle (Eye/Code icons) and zoom controls moved from InlineEmbedControls (inside content body) to RichContentBlock header
- **Context provider**: RichContentBlock provides ContentViewerContext so embed children read state from the block, not manage local state
- **MetaCodeBlock simplified**: Copy button moved from absolute-positioned inside scrollable pre to a label row above the code block
- **Mobile bottom bar**: All action buttons (copy, expand, fullscreen, type-specific) render in a sticky bottom bar on mobile, title stays at top

## Affects

- c3-107 (rich-content): RichContentBlock now owns viewer state and renders controls; EmbedRenderer becomes pure content
- c3-111 (messages): MetaCodeBlock copy button hoisted to label row
- c3-106 (present-content): No code changes — consumes RichContentBlock which now handles controls internally

## Status

accepted

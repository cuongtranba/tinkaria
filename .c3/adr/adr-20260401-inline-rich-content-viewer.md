---
id: adr-20260401-inline-rich-content-viewer
c3-seal: dd75630c63c363d0bb2a920275cbe4240115788cb0e199a43405a4a1b4e2da68
title: inline-rich-content-viewer
type: adr
goal: Add inline rich content viewing to the chat transcript — collapsible/expandable content blocks for markdown, syntax-highlighted code, embeds (diagrams/images/iframes), and diffs. Both user-initiated (click to expand/overlay) and agent-initiated (auto-expand via HTML comment hint). Right sidebar remains for out-of-band content (session diffs per existing plan).
status: provisioned
date: "2026-04-01"
---

## Goal

Add inline rich content viewing to the chat transcript — collapsible/expandable content blocks for markdown, syntax-highlighted code, embeds (diagrams/images/iframes), and diffs. Both user-initiated (click to expand/overlay) and agent-initiated (auto-expand via HTML comment hint). Right sidebar remains for out-of-band content (session diffs per existing plan).

## Affects

- c3-111 (messages) — modify markdown renderers (`shared.tsx`), `TextMessage.tsx`, `ToolCallMessage.tsx`, `FileContentView.tsx` to wrap rich content in `RichContentBlock`
- c3-104 (ui-primitives) — reuse existing `Dialog` for overlay panel, may add a `Sheet` variant
- c3-110 (chat) — no changes, content flows through existing `KannaTranscript` → message renderers

## Decision

Client-side pattern detection on existing markdown output. No new tool calls or server changes. Content types detected from existing markdown AST nodes (code blocks by language, images by src, fenced blocks for mermaid/d2). Optional agent hint via `<!-- richcontent: autoExpand -->` HTML comment for auto-expand.

Two display modes always available for all content:

1. Inline card — collapsible, shows preview when collapsed, full content when expanded
2. Overlay panel — Dialog-based full-screen view for immersive reading

## Refs

- ref-ref-radix-primitives (Dialog for overlay)
- ref-ref-tailwind-theming (styling)

## Rules

- rule-rule-strict-typescript
- rule-bun-test-conventions
- rule-error-extraction

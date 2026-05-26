---
id: ref-screen-composition-patterns
c3-seal: 0cdb52d172995a3fa7b0d1e42ed9e581fde3923b243872d4d8cdf0aef29172e7
title: screen-composition-patterns
type: ref
goal: Document the screen composition vocabulary so new screens reuse existing layout primitives instead of inventing one-off patterns.
---

## Goal

Document the screen composition vocabulary so new screens reuse existing layout primitives instead of inventing one-off patterns.

## Choice

Tinkaria uses three layout vocabularies for different density levels:

### 1. Dense Operations — Panel Primitives

For data-heavy CRUD boards (coordination, admin, monitoring). All from `src/client/components/coordination/CoordinationPanel.tsx`:

| Primitive | Purpose |
| --- | --- |
| PanelHeader | Title + count badge + add action button. Accepts children for extra chrome such as filter tabs. |
| PanelAddForm | Collapsible inline form wrapper; show prop gates visibility. |
| PanelBody | Scrollable list container with flex-1 overflow-y-auto. |
| PanelEmptyState | Centered muted message for zero-item states. |
| PanelListItem | Hoverable bordered row with consistent spacing. Accepts className for conditional styles. |
| PanelSectionHeader | Small muted label dividing list sections, such as Released (3). |
| Dense panel layout: compose panels in CSS Grid (grid-cols-2 grid-rows-2 gap-px bg-border) inside a page wrapper. Each panel is flex flex-col h-full. |  |

### 2. Browse/Discovery — Card Vocabulary

For homepage, project selection, overview surfaces. Currently local to `LocalDev.tsx`:

| Pattern | Description |
| --- | --- |
| ProjectCard | rounded-xl p-4 ring-1 ring-border with hover ring transition and action-first buttons. |
| InfoCard | bg-card border border-border rounded-2xl p-4 general container. |
| SectionHeader | text-[13px] font-medium text-muted-foreground uppercase tracking-wider. |
| PageHeader | Route-level title with optional actions. |
| Browse layout: responsive CSS Grid (grid-cols-1 xl:grid-cols-2) with gap-3. |  |

### 3. Sidebar — Compact Navigation

For persistent sidebar navigation. Owned by `c3-113`:

| Pattern | Description |
| --- | --- |
| Project group header | Sticky header with folder icon, name, and right-aligned action icon buttons shown on hover. |
| ChatRow | Per-session row with model badge, truncated title, and timestamp. |
| Action buttons | h-5.5 w-5.5 !rounded opacity-100 md:opacity-0 md:group-hover/section:opacity-100. |

### Decision Guide

| If building... | Use... |
| --- | --- |
| Data table / CRUD board / ops panel | Panel primitives |
| Project browser / card grid / overview | Card vocabulary + PageHeader |
| Sidebar section / nav list | Sidebar patterns |
| Modal / dialog | Radix Dialog + responsive modal pattern (ref-responsive-modal-pattern) |

## Why

Without this reference, each new screen reinvents layout from scratch — different spacing, rounding, empty states, and header patterns. The coordination panel refactor proved that 4 nearly-identical panels had diverged in subtle ways (missing count badges, raw vs component inputs, inconsistent action button styles). This ref prevents that drift for future screens.

## How

1. Before building a new screen, check this ref and pick the matching vocabulary
2. If a new density level is needed, propose it as an extension to this ref via ADR
3. Panel primitives live in `CoordinationPanel.tsx` — import and compose, don't copy
4. Card vocabulary should be extracted from `LocalDev.tsx` into shared components if reuse grows beyond homepage

---
id: ref-mobile-tabbed-page-pattern
c3-seal: 082ca2ee1edd0c3e4bd35bea98bfeb56fe2b26ebc221320c0c453996fc3e8fcd
title: mobile-tabbed-page-pattern
type: ref
goal: Standardize the mobile-friendly tabbed page layout so every sub-app screen (Settings, Workspace, future admin surfaces) follows the same responsive pattern — compact header with back navigation, labeled segmented tabs, and sidebar auto-dismiss.
---

## Goal

Standardize the mobile-friendly tabbed page layout so every sub-app screen (Settings, Workspace, future admin surfaces) follows the same responsive pattern — compact header with back navigation, labeled segmented tabs, and sidebar auto-dismiss.

## Choice

Tabbed sub-app pages use a three-layer structure:

### 1. Compact Header

**Mobile** (`< md`): Back arrow (`ArrowLeft`, `size-7` tap target) + page title (`text-base font-semibold`). No decorative icon. Minimal padding: `pt-3 pb-2`.

**Desktop** (`md:`): Decorative icon (`size-4 text-muted-foreground`) + page title (`md:text-lg`). No back arrow (`md:hidden`). Padding: `md:pt-4 md:pb-3`.

Pattern:

```tsx
<div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
  <button onClick={() => navigate("/")} className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 md:hidden">
    <ArrowLeft className="size-4" />
  </button>
  <PageIcon className="size-4 text-muted-foreground hidden md:block" />
  <h1 className="text-base font-semibold text-foreground md:text-lg truncate">{title}</h1>
</div>
```

This replaces `PageHeader` for tabbed pages. `PageHeader` with its `pt-16 mb-10` wastes 104px on mobile — 12% of a 844px viewport.

### 2. SegmentedControl Tabs

Full-width on mobile, auto-width on desktop:

```tsx
<SegmentedControl
  options={TAB_OPTIONS}
  size="sm"
  className="w-full md:w-auto"
  optionClassName="flex-1 md:flex-initial justify-center"
  alwaysShowLabels  // ← show text labels alongside icons on mobile
/>
```

The `alwaysShowLabels` prop bypasses the default `hidden md:inline` on icon+label tabs. Use it when there are ≤ 3 tabs — enough horizontal space for labels at 390px. For 4+ tabs, omit the prop to keep icon-only on mobile with tooltips.

### 3. Tab Content — No Duplicate Headings

Tab panels MUST NOT repeat the tab name as an `<h1>`. The active tab in the segmented control already communicates which section is shown. Panels start with a brief description (`text-sm text-muted-foreground`) and action buttons, not a heading.

### 4. Sidebar Dismiss

When navigating to a tabbed page from the sidebar, call `onClose()` after `navigate()` so the sidebar dismisses on mobile. Without this, the sidebar overlay stays open and obscures the destination page.

```tsx
onClick={() => { navigate("/settings"); onClose() }}
```

## Why

The first Settings implementation used `PageHeader` (104px top padding) + icon-only tabs + duplicate section headings. On a 390px×844px mobile viewport, 30% of visible space was decorative chrome with no content. The workspace page had the same issue. This ref prevents future tabbed pages from repeating the mistake.

## How

1. New tabbed sub-app pages MUST use the compact header pattern, not `PageHeader`
2. Set `alwaysShowLabels` on `SegmentedControl` when tab count ≤ 3
3. Tab panels start with description text, not a heading that duplicates the tab label
4. Sidebar navigation to any tabbed page must include `onClose()` for mobile dismiss
5. Back arrow navigates to `/` (home) — not browser history — for predictable behavior

## Examples

**Settings** (`src/client/app/SettingsPage.tsx`): 2 tabs (Providers, Profiles) — uses `alwaysShowLabels`, `Settings` icon on desktop, back arrow on mobile.

**Workspace** (`src/client/app/WorkspacePage.tsx`): 4 tabs (Agents, Repos, Workflows, Sandbox) — does NOT use `alwaysShowLabels` (4 labels too wide at 390px), `Boxes` icon on desktop.

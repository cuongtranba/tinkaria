---
id: ref-ref-radix-primitives
c3-seal: e820bc67f53d392aa86accac3d9b5695b1f0a6afc5cae0862dbc1ca6ef1185fa
title: radix-primitives
type: ref
goal: Build accessible, composable UI components without reimplementing complex interaction patterns (focus management, keyboard navigation, screen reader support).
---

## Goal

Build accessible, composable UI components without reimplementing complex interaction patterns (focus management, keyboard navigation, screen reader support).

## Choice

Radix UI primitives (Dialog, Select, ContextMenu, Popover, Tooltip, DropdownMenu) provide the headless behavior layer, wrapped with Tailwind CSS classes for visual styling. Each component is a thin wrapper composing Radix parts with project-specific styles.

## Why

- Accessible by default — WAI-ARIA compliant without manual effort
- Unstyled base means full control over visual design via Tailwind
- Composable API with slot-based parts (Trigger, Content, Item) fits React patterns
- Battle-tested interaction patterns (focus trapping, escape handling, portal rendering)
- Avoids heavyweight component libraries that impose design opinions

## How

Use Radix only for behavior-heavy primitives, wrapped behind `src/client/components/ui/*` so product surfaces consume stable local components.

Implementation contract:

- Feature code imports local UI wrappers, not raw `@radix-ui/*` primitives, unless creating/updating the wrapper itself.
- Wrapper files own variant classes, focus-visible styles, portals, and accessibility labels.
- Dialog/popover/dropdown changes require keyboard and focus-regression coverage when behavior changes.
- Do not fork one-off dialog/menu primitives in feature components; extend the shared wrapper or add a focused primitive.

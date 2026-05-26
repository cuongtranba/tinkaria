---
id: adr-20260331-dev-mode-inspector
c3-seal: 1ac4a88f522f2f58971615b1fc5a224765b20dec728a8cfdf4ff1ed2f1b2b440
title: dev-mode-inspector
type: adr
goal: Add a "Dev Mode" to Kanna — floating inspector toolbar. When active, hover any UI element to see its source file path, click to copy to clipboard. Enables fast context-building for AI tools.
status: proposed
date: "2026-03-31"
---

## Goal

Add a "Dev Mode" to Kanna — floating inspector toolbar. When active, hover any UI element to see its source file path, click to copy to clipboard. Enables fast context-building for AI tools.

### Design

React's @vitejs/plugin-react already injects _debugSource on every fiber node in dev mode. Zero Vite config changes needed:

1. DOM element → element[__reactFiber$...] → fiber node
2. Walk fiber up → nearest _debugSource → { fileName, lineNumber, columnNumber }
3. Display in overlay + copy on click

### New Files

- src/client/stores/devModeStore.ts — Zustand persisted store
- src/client/components/dev/DevInspector.tsx — Overlay + toolbar component
- src/client/components/dev/useDevInspector.ts — Hook: DOM listeners, fiber traversal
- Tests for each

### Modified

- src/client/app/App.tsx — Add DevInspector inside providers

### UX

- Toggle: Alt+D shortcut
- Hover: blue overlay, tooltip with file:line
- Click: copy file:line to clipboard
- Dev-only: renders null in production

### Affects

c3-101 (app-shell), c3-102 (stores)

---
id: c3-1
c3-seal: a36fe12f6cf712cff8e36f3f6d2f5a2eb39cc4242c7d9441c0c0444b57c89a05
title: client
type: container
boundary: service
parent: c3-0
goal: React 19 single-page application running in the browser — chat interface, terminal emulation, project management, settings UI.
---

## Goal

React 19 single-page application running in the browser — chat interface, terminal emulation, project management, settings UI.

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-101 | app-shell | Foundation | active | Routing, layout, providers, and client-level composition. |
| c3-102 | stores | Foundation | active | Client-side state and persistence boundaries. |
| c3-103 | theme | Foundation | active | Dark/light/system theming and design tokens. |
| c3-104 | ui-primitives | Foundation | active | Reusable Radix-based component primitives. |
| c3-106 | present-content | Feature | active | Transcript-delivered rich artifact rendering. |
| c3-107 | rich-content | Feature | active | Markdown, code, diagram, HTML, SVG, and Pug embed rendering. |
| c3-108 | ui-identity | Foundation | active | Stable UI identity metadata and inspection overlays. |
| c3-110 | chat | Feature | active | Main chat route, command dispatch, and active turn state. |
| c3-111 | messages | Feature | active | Prompt, assistant, tool, and transcript message rendering. |
| c3-112 | chat-input | Feature | active | Composer input, queueing controls, and model selection. |
| c3-113 | sidebar | Feature | active | Navigation, project groups, session lists, and route entry. |
| c3-115 | right-sidebar | Feature | active | File explorer and adjacent workspace panel behavior. |
| c3-117 | projects | Feature | active | Project discovery, overview, and creation surfaces. |
| c3-118 | transcript-lifecycle | Feature | active | Transcript delivery state, projection freshness, raw-event coalescing, and ready render-unit handoff. |
| c3-119 | transcript-renderer | Feature | active | Units-only transcript presentation, virtualization, stable measurement, and dispatch to message renderers. |
| c3-120 | extensions | Feature | active | Project extension surfaces including C3, agents, and code views. |

## Responsibilities

- Render chat transcripts with rich message types (tool calls, diffs, todos, plans)
- Provide embedded terminal workspace via xterm.js
- Manage UI state (theme, layout, preferences) via Zustand stores
- Connect to server via WebSocket for real-time state updates
- Handle project navigation, sidebar, and settings UI

## Complexity Assessment

Moderate-to-Complex: 96 TSX/TS files, rich message rendering pipeline, multi-panel layout with resizable panes, terminal integration, drag-and-drop project ordering.

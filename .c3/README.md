---
id: c3-0
c3-seal: fda826355fee9a301e9baf3bcd658d0bc95281c78d7e2360fde99ff90fcb9589
title: tinkaria
goal: Provide a playful, web-based workbench UI for interacting with Claude Code and Codex — chat, terminals, project management, multi-provider support
---

# Tinkaria

Full-stack TypeScript web UI for AI coding assistants (Claude Code & Codex CLIs).

## Architecture

- **Client**: React 19 SPA with Zustand stores, Radix UI primitives, Tailwind CSS 4, xterm.js terminals
- **Server**: Bun HTTP + WebSocket server with event-sourced JSONL persistence and CQRS read models
- **External**: Spawns Claude/Codex CLI subprocesses, embedded PTY terminals, Cloudflared tunnels

## Key Patterns

- Event sourcing (JSONL logs + snapshot compaction)
- CQRS (write: events -> state, read: derived snapshots)
- WebSocket subscription model (topic-based: sidebar, chat, terminal, keybindings)
- Multi-provider abstraction (Claude + Codex, normalized catalog)
- Multi-turn AI session management with tool gating

## Constraints

- Bun runtime only (not Node.js)
- Strict TypeScript (no `any`)
- React 19 with function components
- Tailwind CSS 4 with CSS variable theming

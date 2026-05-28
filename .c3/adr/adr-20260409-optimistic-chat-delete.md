---
id: adr-20260409-optimistic-chat-delete
c3-seal: 18bdbd851453a9f100bdad10276de10794158fb885ac9e445e6b718f634a7d3d
title: optimistic-chat-delete
type: adr
goal: 'Make chat deletion from sidebar feel instant by applying an optimistic UI pattern: remove the chat from sidebar state immediately after user confirmation, navigate away if needed, then fire the server `chat.delete` command in the background without blocking the UI.'
status: proposed
date: "2026-04-09"
---

## Goal

Make chat deletion from sidebar feel instant by applying an optimistic UI pattern: remove the chat from sidebar state immediately after user confirmation, navigate away if needed, then fire the server `chat.delete` command in the background without blocking the UI.

## Affected

- c3-113 (sidebar) — ChatRow delete trigger
- useChatCommands.ts — `handleDeleteChat` function
- useAppState.ts — expose `setSidebarData` to commands layer

## Approach

1. Pass `setSidebarData` into `ChatCommandsArgs`
2. In `handleDeleteChat`, after dialog confirmation:

- Optimistically filter the chat from `sidebarData.projectGroups` and call `setSidebarData`
- Clear cached chat + navigate immediately (synchronous)
- Fire `socket.command({ type: "chat.delete" })` without awaiting — errors logged to console.warn

1. The server will eventually push a fresh sidebar snapshot via WS, which re-syncs state

## Decision

Optimistic removal. The server-side delete (`agent.disposeChat` + `store.deleteChat`) involves process teardown and file IO that should never block the UI.

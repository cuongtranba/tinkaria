---
id: adr-20260407-merge-sessions
c3-seal: d7fbabd332bd2ec9f19ef33b0d61fbc411adc481aa45300a58d539d7b6ce3214
title: merge-sessions
type: adr
goal: Add a "Merge Sessions" feature — the inverse of fork. Users select multiple existing sessions, provide a merge intent (via preset or custom prompt), and Tinkaria derives a compact analysis of each source session's transcript, synthesizes them into a single seed prompt, and opens a new independent session.
status: implemented
date: "2026-04-07"
---

## Goal

Add a "Merge Sessions" feature — the inverse of fork. Users select multiple existing sessions, provide a merge intent (via preset or custom prompt), and Tinkaria derives a compact analysis of each source session's transcript, synthesizes them into a single seed prompt, and opens a new independent session.

## Affected Entities

| Entity | Impact |
| --- | --- |
| c3-110 (chat) | New MergeSessionDialog component, navbar trigger, handleMergeSession in TinkariaState |
| c3-205 (nats-transport) | New chat.generateMergePrompt command responder |
| c3-113 (sidebar) | Session list types reused for merge source selection |
| ref-fork-session-seeding | Pattern reference — merge follows same architecture |

## Work Breakdown

1. Create `src/shared/merge-presets.ts` — preset definitions (Synthesis, Compare & Decide, Consolidate Progress, Knowledge Base)
2. Create `src/server/generate-merge-context.ts` — multi-session transcript extraction + LLM synthesis via QuickResponseAdapter
3. Add `chat.generateMergePrompt` to protocol types (`src/shared/protocol.ts`)
4. Add responder handler in `src/server/nats-responders.ts`
5. Create `src/client/components/chat-ui/MergeSessionDialog.tsx` — session multi-select + intent + provider/model picker
6. Add `handleMergeSession` to `useTinkariaState.ts`
7. Wire MergeSessionDialog into ChatPage + add merge button to ChatNavbar

## Risks

- Prompt budget: multiple sessions multiply transcript size — mitigated by per-session budget cap (total / N)
- Session access: v1 limits to Tinkaria chats only (sidebar chats with server-side transcript), not CLI sessions
- Max 5 sessions per merge to prevent prompt explosion

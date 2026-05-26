---
id: adr-20260416-transcript-render-units-read-model
c3-seal: a398eb7cf7773b7bc855c93acb018728f7086c11803bc8f30f7a568f0593cb02
title: transcript-render-units-read-model
type: adr
goal: Simplify transcript rendering by making render units the deterministic read model for chat UI.
status: implemented
date: "2026-04-16"
---

## Goal

Simplify transcript rendering by making render units the deterministic read model for chat UI.

Decision:

- Immutable transcript entries remain the stored source of truth.
- src/shared/transcript-render.ts owns the single exhaustive fold from transcript facts to render-ready units.
- Chat snapshots carry a bounded renderUnits tail window; live transcript events trigger complete window replacement through chat.getRenderUnits, not client-side incremental guessing or diffing.
- Render unit ids are prefixed and deterministic from sourceEntryIds: assistant_response:e1, wip:first:last, tools:first:last, artifact:first, unknown:first.
- Tool grouping is explicit: consecutive non-special, non-error work tools become tool_group; WIP groups absorb assistant narration plus work tools; interactive/artifact/error/unknown tools remain standalone.
- Unknown transcript facts render visibly as unknown units.
- Existing sessions use the one-off copy:legacy-transcripts script that invokes the existing event-store legacy transcript migration; no runtime compatibility layer is added.
Implementation:
- Added TranscriptRenderUnit shared types and ChatSnapshot.renderUnits.
- Added shared fold tests for empty transcripts, rationale ejection, latest TodoWrite/status, artifacts, errored tools, unknown tools, pending/interrupted streams, consecutive prompts, and tool grouping.
- Server read models and NATS responders derive render units; chat.getRenderUnits exposes deterministic render windows.
- Client transcript lifecycle/cache/height/render paths now consume render units. ChatTranscript renders units directly and no longer owns grouping, status hiding, system dedupe, TodoWrite latest selection, or context-cleared result hiding.
- Subagent inspector uses render units for known chats and the shared fold for external provider transcript files.

## Context

Current chat rendering derives WIP blocks, assistant answers, special tool boundaries, present_content artifacts, latest-only TodoWrite, and status/result visibility in client-side render code. The user wants current UI concepts preserved, but no client guessing: immutable transcript facts fold once into deterministic render units, and the frontend renders those units only.

## Decision

Implement a stream-to-render contract across server/shared/client:

- immutable transcript entries remain stored facts;
- a server/shared fold creates render-ready units with deterministic prefixed ids and sourceEntryIds;
- chat snapshots/tail/live UI data expose complete folded render-unit windows;
- frontend ChatTranscript switches on render unit kind only;
- no permanent compatibility layer; existing sessions are handled by a one-off migration/copy script if needed.

## Verification

Use RED-GREEN-TDD:

1. Add failing fold tests for current boundary behavior plus empty/pending/unknown/interrupted/consecutive prompt cases.
2. Add failing server snapshot/tail tests proving render units are returned for UI.
3. Add failing client tests proving ChatTranscript consumes render units and no longer filters hidden/null rows at render time.
4. Green implementation, then run focused transcript/render/server tests, native TypeScript check, C3 check, git diff check, and browser smoke with axi.

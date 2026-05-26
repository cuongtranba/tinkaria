---
id: adr-20260410-transcript-payload-budgeted-paging
c3-seal: 497e8853f9f7606be7ccd0132e75777b15bf5c847b7f4fd42bd2cab091e225ab
title: transcript-payload-budgeted-paging
type: adr
goal: Supersede the unsafe assumption in `adr-20260401-chunked-transcript-loading` that a fixed tail window by entry count is transport-safe.
status: proposed
date: "2026-04-10"
---

## Goal

Supersede the unsafe assumption in `adr-20260401-chunked-transcript-loading` that a fixed tail window by entry count is transport-safe.

**Observed failure:** screenshot-heavy transcript entries can be individually large enough that `chat.getMessages(offset, limit)` exceeds NATS `max_payload` even when the client only asks for the last 200 entries. In the reproduced failure, the chat runtime snapshot was already `idle`, but transcript hydration fell back to empty because the history request blew the transport budget.

**Primary decision — transport-safe history paging:**

Move transcript history loading from a client-guessed `offset/limit` contract to a server-owned, payload-budgeted page contract in `c3-205` (`nats-transport`), backed by `c3-201` (`event-store`).

Proposed API shape:

```ts
{ type: "chat.getTranscriptPage", chatId, cursor?: string, direction: "backward", targetEntries?: number, maxBytes?: number }
```

Response shape:

```ts
{ entries: TranscriptEntry[], nextCursor: string | null, hasMore: boolean, approxBytes: number }
```

Contract rules:

1. The server chooses page boundaries.
2. The response must stay below a conservative transport byte budget derived from NATS request/reply safety, not a fixed entry count.
3. `targetEntries` is advisory only; `maxBytes` is the hard cap.
4. If one large entry alone would otherwise overflow the target page, the server still returns a valid bounded page rather than failing the entire request.
5. The client asks for a useful tail page, then backfills with older pages only when rendering logic proves more history is needed.
This keeps transport safety inside the transport boundary, where `c3-205` already owns protocol correctness, request/reply semantics, and responder behavior.
**Secondary decision — externalize large transcript artifacts:**
Do not keep treating append-only transcript JSONL as a blob store. Large screenshot/tool-result payloads should move to asset-backed references so transcripts remain event logs, not transport-hostile binary containers.
Target direction:

- transcript entry stores metadata + asset reference
- large binary payload stored separately on disk
- rich-content surfaces resolve the asset lazily when needed
Example shape:

```ts
{ type: "image_ref", assetId, mimeType, byteSize, width, height }
```

This second phase reduces disk growth in `c3-201`, request/reply pressure in `c3-205`, and hydration/parse memory in `c3-110` (`chat`).

**Affected entities:**

- `c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
`c3-205` (`nats-transport`) — new transcript paging command and bounded responder behavior
- `c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
`c3-201` (`event-store`) — cursor/page assembly under byte budget
- `c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
`c3-204` (`shared-types`) — protocol update for paged transcript reads and asset references
- `c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
`c3-110` (`chat`) — client transcript hydration switches to cursor paging
- `c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
`c3-107` (`rich-content`) and `c3-106` (`present-content`) — lazy asset resolution for externalized artifacts
**Why this is better than raising NATS limits or rewriting transcript content first:**
- Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
Raising `max_payload` just moves the ceiling and increases blast radius.
- Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
Client-only chunk splitting is a guardrail, not a sound contract.
- Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Editing transcript content in place fights `ref-ref-event-sourcing` and turns storage cleanup into a hidden behavior change.
**Verification matrix:**
Phase | Proof
Primary | responder tests prove no chat.getTranscriptPage reply exceeds configured byte budget
Primary | browser proof on a screenshot-heavy chat shows transcript hydration succeeds from idle snapshot without fallback_empty
Primary | tail-first load plus backfill still preserves ordering when live JetStream events arrive during paging
Primary | typecheck + targeted transcript tests + transport responder tests pass
Secondary | stored transcript entries no longer inline large base64 image blobs for new tool results

Secondary | asset-backed transcript rendering matches prior UX for images and present-content artifacts

Secondary | migration strategy is explicit: old inline entries remain readable; new writes use asset refs

Status: |

Proposed. This ADR should supersede the "no server changes needed" claim in adr-20260401-chunked-transcript-loading while preserving its tail-first intent. |

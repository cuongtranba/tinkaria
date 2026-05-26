---
id: rule-transcript-boundary-regressions
c3-seal: f6b5931b1574ae9a0fcddf80d48d1d8692b539c04b33d990ca3d7550f90a03ef
title: transcript-boundary-regressions
type: rule
goal: Prevent transcript-flow changes from silently breaking live assistant visibility, WIP grouping, tool-result hydration, or structured artifact rendering.
---

## Goal

Prevent transcript-flow changes from silently breaking live assistant visibility, WIP grouping, tool-result hydration, or structured artifact rendering.

## Rule

Any change to transcript entry production, tool normalization, transcript hydration, `ChatTranscript.groupMessages`, WIP grouping, assistant text rendering, or `present_content`/rich-content rendering must include focused regression evidence for the boundary it changes.

Required proof by changed surface:

- Agent/provider/server transcript production: prove emitted entry order and typed payload shape.
- Shared tool normalization or transcript types: prove tool kind/result hydration for affected tool names.
- Hydration path: prove bulk and incremental hydration agree; prove `tool_result` updates return a fresh message-array reference.
- Grouping path: prove narration/tools/errors/special tools/final assistant answer boundaries.
- Render path: prove semantic UI id and dedicated renderer (`message.wip-block.area`, `message.assistant.response`, `message.present_content.item`, rich-content viewer ids where relevant).

## Golden Example

`ChatTranscript.test.tsx` locks WIP grouping and live trailing answer visibility; `parseTranscript.test.ts` locks bulk/incremental hydration and tool-result mutation; `PresentContentMessage.test.tsx` and `RichContentBlock.test.tsx` lock artifact rendering.

## Not This

Do not rely on snapshot-only proof for this area. Do not hide final assistant text inside WIP because a tool already ran. Do not render interactive/special tools as generic collapsed tool calls. Do not treat `tool_result` as its own visible message when it semantically completes an existing tool call.

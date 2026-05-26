---
id: recipe-agent-turn-render-flow
c3-seal: 0d2b867c74ab4606e3cefbe1f12e022f9792bbab648871e9dc524c353400fd82
title: agent-turn-render-flow
type: recipe
goal: Trace one live agent flow from provider output through transcript hydration into user-visible render interaction so future changes can reason across WIP, assistant text, special tools, and present_content rich artifact cards.
---

## Goal

Trace one live agent flow from provider output through transcript hydration into user-visible render interaction so future changes can reason across WIP, assistant text, special tools, and present_content rich artifact cards.

## Sources

- c3-210: owns provider harness control plane and transcript entry contract.
- c3-208: owns runner/kit runtime bridge that emits live turn events over NATS.
- c3-216: owns Codex app-server event translation and present_content dynamic tool handling.
- c3-206: owns delegated-session tool flow that can appear inside transcript turns.
- c3-226: owns server transcript event consumption and store/state-change handoff.
- c3-204: owns shared transcript/tool types and tool normalization.
- c3-118: owns client transcript lifecycle, cache/tail fetch, buffering, and hydration.
- c3-119: owns transcript render interaction, virtual rows, WIP grouping, answer detection, and dedicated-tool boundaries.
- c3-111: owns individual message surfaces.
- c3-106: owns present_content artifact normalization/rendering.
- c3-107: owns shared rich-content viewer/embed primitives.
- ref-live-transcript-render-contract: owns cross-boundary invariants.
- rule-transcript-boundary-regressions: owns proof requirements.

## Flow

1. Agent turn starts in c3-210 and executes through runner/provider seams rather than provider transport leaking into UI/server orchestration code.
2. Runtime bridge in c3-208 and provider adapters such as c3-216 emit ordered transcript/tool/status events.
3. c3-226 consumes runner events, resumes from JetStream/KV state, appends transcript entries to c3-201, and notifies live subscribers.
4. Tool calls use c3-204 normalization so UI sees semantic toolKind values instead of raw provider names.
5. c3-118 receives snapshots/events, restores cache, fetches/backfills tail windows, buffers live events before initial fetch, hydrates transcript entries, and returns fresh message arrays after tool_result mutation.
6. c3-119 derives render items: generic narration/tool sequences become WIP, final/live assistant answer text stays visible, dedicated tools such as AskUserQuestion/ExitPlanMode/TodoWrite/present_content stay outside WIP, and virtual row measurement stays stable.
7. c3-111 renders message surfaces; c3-106 renders present_content as message.present_content.item; c3-107 supplies markdown/code/embed/overlay behavior.
8. Verification must cover boundary logic and visible renderer identity when behavior crosses from data shape to UI surface.

## Failure Modes

- Live final answer swallowed into WIP after a tool has already run.
- Special tools such as `AskUserQuestion` or `ExitPlanMode` lose their visible rationale text.
- `present_content` regresses to generic tool chrome.
- Incremental hydration mutates a tool result without returning a new array reference, so React does not repaint.
- ChatTranscript or transcript server files become unmapped and C3 lookup stops warning maintainers about the render contract.

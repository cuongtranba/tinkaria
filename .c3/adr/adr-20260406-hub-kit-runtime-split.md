---
id: adr-20260406-hub-kit-runtime-split
c3-seal: c1c863679d9d6c1409b5dd8d5a93da4c9e59852ff829d4c38e0d4d2c84b89cad
title: split runtime into hub control plane and kit workers
type: adr
goal: '[ASSUMED] Design-only ADR for a runtime split that isolates durable server concerns from disposable agent execution while keeping the naming contract precise enough to implement without transport ambiguity.'
status: provisioned
date: "2026-04-06"
---

## Goal

[ASSUMED] Design-only ADR for a runtime split that isolates durable server concerns from disposable agent execution while keeping the naming contract precise enough to implement without transport ambiguity.

## Decision

Adopt a two-role architecture:

- `hub` is the control plane. It hosts HTTP/UI, embedded NATS, the event store, read models, chat/project/session identity, orchestration state, approval flow, and the authoritative transcript.
- `kit` is a long-lived execution daemon. It advertises capabilities, accepts leased turn assignments from the hub, runs provider-specific agent work, and emits status/tool/result events back to the hub.
A single `kit` is not a one-shot worker. It is expected to handle many operations across many projects and agent sessions up to its configured capacity.

## Responsibilities

### Hub

- Start and own NATS transport and all client-facing responders.
- Persist every transcript entry and turn lifecycle event.
- Own orchestration semantics (`spawn_agent`, `send_input`, `wait_agent`, `close_agent`).
- Match turns onto eligible kits using provider/profile/capability filters.
- Issue leases, track heartbeats, and recover abandoned turns.
- Publish snapshots to the UI and expose the authoritative session state.

### Kit

- Register with the hub using a `KitProfile` that describes machine identity, provider support, skill pack, system-prompt profile, labels/tags, and max concurrency.
- Run Claude/Codex execution in an isolated process/runtime boundary.
- Maintain provider-local session/thread state only as an execution cache, never as the source of truth.
- Stream execution events, tool requests, completion/failure signals, and heartbeat signals back to the hub.
- Stop work on lease loss or explicit cancel from the hub.
- Support many concurrent operations across many projects and chats, subject to its declared limits.

## Naming Layers

The design uses three distinct naming layers. They MUST NOT be collapsed together.

### Tool Layer

`spawn_agent`, `send_input`, `wait_agent`, and `close_agent` are user-facing orchestration tools exposed by the hub.

### Design Layer

`kit.register`, `kit.heartbeat`, `turn.start`, `turn.cancel`, `turn.event`, `tool.request`, `tool.result`, `turn.complete`, and `turn.fail` are conceptual ADR verbs for the hub/kit state machine.

### Wire Layer

The current runtime still uses the existing `kanna.snap.*`, `kanna.evt.*`, and `kanna.cmd.*` NATS namespace plus command types such as `chat.send` and `chat.cancel`. Those wire names remain unchanged in the first implementation slice unless shared protocol/types and subject helpers are updated explicitly.

No implementer should infer a literal top-level NATS subject layout from the conceptual ADR verbs alone.

## Naming Map

- Current server/runtime authority maps to the future `hub` role.
- `kit` names the runtime role, not the current NATS subject prefix.
- The legacy `kanna.*` transport namespace remains in place initially for compatibility.

## Hard Boundaries

- Kits MUST NOT write durable chat/project/task/orchestration state directly.
- Kits MUST NOT publish UI snapshots directly.
- The hub MUST remain the only authority for chat identity, transcript order, task/orchestration state, and client-visible status.
- `project-agent` remains in the hub because it queries and coordinates shared project state rather than executing provider work.

## Scheduling Rules

- Prefer the same kit for follow-up turns when the provider session/thread token lives there.
- Fall back to any compatible kit when affinity cannot be satisfied.
- Keep a built-in local kit mode so single-machine/dev usage still works without remote execution daemons.

## Migration Plan

1. Extract an `AgentRuntime` boundary from the current in-process coordinator so turn execution is abstracted behind an interface.
2. Keep NATS, event store, responders, read models, and orchestration inside the hub.
3. Add one external local `kit` daemon that connects back to the hub over NATS.
4. Route Codex turns through that kit first while Claude remains in-process.
5. Add kit registry, capability matching, leases, and heartbeat recovery.
6. Move Claude execution behind the same worker contract.
7. Only after the local kit path is stable, enable multi-machine kits.

## Risks

- Hidden distributed state if orchestration logic leaks into kits.
- Resume/retry complexity when provider-local thread tokens are stranded on a dead kit.
- Ordering bugs if kits append transcript state directly instead of emitting events.
- Over-designing discovery/placement before the first local external kit proves the boundary.
- Naming drift between ADR shorthand and transport/protocol code if the layers above are not kept explicit.

## Acceptance Criteria For The First Slice

- Restarting UI/hub code no longer requires the agent runtime to be embedded in the same process boundary.
- The hub can survive with zero registered kits and report that state clearly.
- One local kit can execute a leased Codex turn and stream events back through the hub into the existing transcript model.
- Cancellation and kit-loss paths leave a deterministic transcript/result state in the hub.
- The first implementation slice documents any new wire subjects/types explicitly in shared protocol code instead of inferring them from ADR shorthand.

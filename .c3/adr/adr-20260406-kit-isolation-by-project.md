---
id: adr-20260406-kit-isolation-by-project
c3-seal: df16a99309d86ee9ac4961feae013d0902b22c128e2feeeb2a523e608d35a36d
title: define kit as the resilient execution unit with per-kit agent settings
type: adr
goal: '[ASSUMED] Keep the multi-node design simple while making it resilient.'
status: provisioned
date: "2026-04-06"
---

## Goal

[ASSUMED] Keep the multi-node design simple while making it resilient.

We want three things only:

- `kit` is the execution unit. It is a long-running daemon that connects to the hub and runs agent work.
- each `kit` can carry a different set of agent settings, such as system prompt, skills, tools, and other runtime-facing behavior exposed by Claude Code or Codex.
- a running `kit` should not be taken down just because the hub disappears temporarily.
At minimum, the system can run with exactly one kit. That single kit represents the system-wide agent executor.

## Decision

Adopt a simple `hub + kits` model over the existing NATS transport:

- `hub` keeps durable state and coordination.
- `kit` runs agent execution.
- long-running tasks and agent sessions execute inside kits.
- the hub assigns work to a connected kit over NATS.
- every kit declares its agent settings up front.
- if the hub disconnects, a kit keeps active work running, buffers unreconciled events locally, and replays them after reconnect.
A kit is not the transcript owner and not the orchestration owner. It is the worker daemon with temporary recovery responsibility.

## Transport

Use the existing embedded NATS transport as the only wire between hub and kit.

That means:

- kit connects as a NATS client
- hub and kit communicate through NATS subjects
- no extra side-channel protocol is introduced for kit execution

## Hub Responsibilities

The hub remains the source of truth for:

- chats and projects
- transcript and message order
- orchestration state such as `spawn_agent`, `send_input`, `wait_agent`, and `close_agent`
- scheduling work onto available kits
- approvals and user-facing state
- durable ingest of turn events
- replay reconciliation after kit reconnect

## Kit Responsibilities

A kit is a long-running daemon process that:

- connects to the hub
- stays alive and ready for work
- advertises what kind of agent behavior it provides
- starts Claude Code or Codex execution for assigned work
- streams events and results back to the hub
- keeps active work running during temporary hub disconnects
- buffers unacknowledged events locally until the hub confirms them
- re-registers and reconciles after reconnect
At minimum there is one kit in the system. More kits can be added later.

## Kit Settings

Each kit may expose a different runtime configuration for the agent it runs.

This is intentionally a simple configuration layer over tools like Claude Code and Codex. It represents the settings and behavior that the hub should treat as part of the kit identity.

Examples of kit settings:

- provider family (`claude` or `codex`)
- system prompt or developer-instruction overlay
- skills made available by default
- tool exposure or tool restrictions
- environment and config roots
- sandbox or approval defaults
- max concurrency
In simple terms, two kits may run the same provider but still behave differently because their settings differ.

## Simplest Topology

The minimal topology is:

- one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
- one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
one kit
That already gives us the split we want:
- hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
hub owns truth
- kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
kit owns execution
The next step up is:
- one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
one hub
- many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.
many kits with different settings
That gives us multiple agent behaviors without changing the hub role.

## Routing Model

Keep the routing model simple:

`project or chat -> chosen kit -> run agent work`

For now, the key idea is only that the hub chooses a compatible kit and sends work there.

We do not need a more complex policy model in this ADR.

## Resilience Rule

If the hub disconnects:

- kit does not accept new work
- kit keeps existing work running
- kit buffers events and final results that the hub has not yet acknowledged
- kit keeps trying to reconnect
- after reconnect, kit re-registers and replays buffered events until the hub catches up
This keeps the kit resilient without making it the source of truth.

## Recovery Rule

To support replay safely:

- each turn event needs a stable turn id and per-turn sequence number
- hub acknowledges the highest applied sequence per turn
- kit may resend already-sent events during recovery
- hub ingest must therefore be duplicate-safe
The recovery journal inside the kit is only a delivery buffer, not the authoritative transcript.

## Session Rule

A chat or long-running agent session should stay on the same kit when possible.

Reason:

- the runtime inside the kit may hold provider-local session or thread state
- changing kit settings mid-session can change behavior unexpectedly
- reconnect recovery is simplest when a running turn stays attached to its original kit
If we intentionally move a chat to a kit with different settings, the safe default is to start a fresh provider session.

## Why This Is Better

- keeps the hub small and clear
- makes execution pluggable
- supports one-kit systems and many-kit systems with the same mental model
- allows different agent behavior without scattering prompt or skill logic across the hub
- makes hub restarts survivable for long-running turns

## First Implementation Slice

1. extract the execution boundary from the current in-process agent runtime
2. define a kit registration shape that includes its settings identity
3. add NATS subjects for kit register, heartbeat, turn start, turn event, turn completion, and replay recovery
4. run one local kit daemon connected back to the hub
5. route Codex work through that kit first
6. add per-turn sequence numbers plus hub acknowledgements
7. add a bounded local recovery journal inside the kit
8. keep all transcript and orchestration truth in the hub

## Risks

- if kit settings are vague, the hub will not know when two kits are meaningfully different
- if event sequencing or acknowledgements are wrong, replay can duplicate or drop transcript entries
- if the kit recovery journal grows without bounds, outages can turn into local disk pressure
- if the hub starts embedding too much prompt or skill logic again, the split loses value

## Acceptance Criteria For Design

- the system works with one hub and one kit
- a kit is clearly understood as the long-running execution daemon
- two kits can run different agent settings even if they use the same provider family
- a hub restart does not automatically kill active turns in the kit
- after reconnect, the hub can reconcile buffered turn events without corrupting transcript order
- the hub remains the only durable source of truth

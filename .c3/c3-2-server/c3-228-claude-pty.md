---
id: c3-228
c3-seal: de7996b14ff06df3d1f965218f0ad7b2f6e99b7a0812bb7bfb53fd7ffd8b7a36
title: claude-pty
type: component
category: feature
parent: c3-2
goal: Run the local claude CLI inside a PTY so Tinkaria can deliver subscription-billed Claude turns alongside the API and Codex providers.
---

## Goal

Run the local claude CLI inside a PTY so Tinkaria can deliver subscription-billed Claude turns alongside the API and Codex providers.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 server |
| Sibling family | c3-210 agent, c3-211 providers, c3-216 codex |
| Transport coupling | c3-205 nats-transport carries pty.* subjects |
| Persistence coupling | c3-201 event-store consumes translated HarnessEvent stream |

## Purpose

Owns spawning, lifecycle, PID supervision, JSONL parsing, smoke-test gating, OAuth-pool wiring, and Settings-page exposure for the claude CLI when run as a long-lived TUI subprocess. Does not replace the API-based Claude provider; does not include sandbox isolation; does not supply a generic shell terminal.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | Bun runtime must expose Bun.Terminal API for PTY allocation | rule-rule-bun-runtime |
| Inputs | spawn payload carries chatId, cwd, model, planMode plus OAuth pool token | c3-205 |
| State | PtyInstance registry kept in-memory with coalesced delta fan-out and persisted PID registry on disk | c3-201 |
| Shared deps | external claude binary plus per-spawn runtime directory with mcp-config and settings | c3-211 |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | Operator drives a live claude TUI turn from the chat input and transcript renders alongside API turns | c3-119 |
| Primary path | pty.spawn routes through driver which spawns PtyProcess under setsid, waits for TUI ready marker, commits prompt, streams JSONL, translates to HarnessEvent, persists into event-store | c3-201 |
| Alternate | OAuth token absent rejects spawn at the auth gate before any process is created | rule-subprocess-ipc-safety |
| Failure | crash recovery on next server boot reaps orphan PIDs and removes per-spawn runtime directories | rule-external-source-stale-handle-guards |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| rule-subprocess-ipc-safety | rule | child process IPC handling and process tree ownership | binding | sandbox waiver tracked in decision 0007 |
| ref-nats-transport-hardening | ref | pty.* subject namespace conventions on NATS WebSocket | binding | matches existing transport seam |
| rule-prefixed-logging | rule | observability and greppable log lines | binding | every emission carries the claude-pty prefix |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| pty.spawn pty.input pty.resize pty.cancel pty.exit pty.snapshot | IN | NATS request reply JSON payloads with gzip past 64KB threshold | server boundary | src/server/pty-responders.ts |
| pty.delta broadcast | OUT | PtyInstanceDelta serialized and published on runtime.evt.pty subject | server to client | src/server/pty-responders.ts |
| PtyInstanceState shape | OUT | Type contract for client Zustand store and indicator | client boundary | src/shared/pty-instance.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Subprocess running at full user privilege | spawning claude binary without seatbelt or bwrap | spawn log line names the binary path and absence of wrap profile | git log docs/decisions/0007-port-claude-pty-provider.md before deploy |
| Orphan claude children on non graceful exit | Bun process killed with SIGKILL while PTY is live | persisted claude-pty-registry.json plus reap log at next boot | bun test src/server/claude-pty/pid-registry.test.ts |
| JSONL to HarnessEvent translation drift | claude CLI release bumps message schema | parity-matrix test exercises seeded fixtures | bun test src/server/claude-pty/ |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| src/server/claude-pty source tree | Contract surfaces in this component | implementation refactor allowed when pty.* contract holds | git ls-files src/server/claude-pty/ |
| src/server/pty-responders.ts | Contract surfaces in this component | none beyond logging detail | grep registerPtyResponders src/server/server.ts |
| src/client/components/chat-ui/PtyInstancesIndicator.tsx | Contract surfaces in this component | visual polish allowed while PtyInstanceState shape stays stable | git ls-files src/client/components/chat-ui/PtyInstancesIndicator.tsx |

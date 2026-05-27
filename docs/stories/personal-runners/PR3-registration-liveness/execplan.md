# Exec Plan — PR3 Registration & Liveness + Versioning

## Goal

Make runner liveness correct across machines (heartbeat-TTL states, not pid) and
add a protocol-version handshake that loudly marks incompatible runners and
blocks turn start — so paired/spawned runners are uniformly observable and a
version skew fails fast with a clear message instead of an opaque turn error.

## Scope

In scope:

- `RunnerRegistration` + `protocolVersion`, server-tracked `lastHeartbeatAt`,
  `capabilities` field (minimal: the existing providers; rich probe = PR4). `pid`
  retained as informational only.
- `PROTOCOL_VERSION` constant + supported-range check → `incompatible` state.
- Heartbeat-TTL liveness: `online` / `degraded` (≥25s) / `offline` (≥60s), as a
  pure function of `(lastHeartbeatAt, now)`. Replace `process.kill(pid,0)` in the
  discover path with heartbeat age.
- Session-start gate: block `start_turn` for an incompatible runner with a clear
  message.
- `/health` `runner`: add `state`, `protocolVersion`, `incompatible`.

Out of scope (see overview Non-Goals): suspend/resume + needs-attention (PR6/7),
rich capabilities + command split (PR4), multi-runner routing (PR5), ownerId,
auto-update.

## Risk Classification

Risk flags: Data model (registration shape — additive, KV entries are ephemeral /
re-registered, no migration), Public contracts (registration shape +
protocolVersion handshake + turn-start behavior), Existing behavior (liveness
pid→heartbeat; new turn-start gate), Cross-platform (cross-machine liveness).

No hard gate (no auth/authz/data-loss/external-provider). High-risk by flag count
(4) + initiative pre-classification.

## Work Phases

1. **Design lock** — this packet + decision 0009.
2. **Validation planning** — pure liveness-state function table (online/degraded/
   offline boundaries); incompatible computation; turn-start block; /health shape.
3. **Implementation** — Stage 1 (registration fields + `PROTOCOL_VERSION` +
   handshake/incompatible + turn-start gate); Stage 2 (liveness states + discover
   heartbeat-liveness + `/health.state`).
4. **Verification** — unit (state function + incompatible) + integration (injected
   `lastHeartbeatAt` → degraded/offline; incompatible runner → start blocked) +
   live E2E (a real runner shows `online`; a version-bumped runner → blocked).
5. **Review** — typescript-reviewer (async/state correctness); no new
   auth/credential surface so a full security pass isn't required (note in close).
6. **Harness update** — story/decision/trace/TEST_MATRIX/backlog.

## Stop Conditions

Pause for human confirmation if:

- Liveness states need to drive **session suspend/resume** (that needs the
  git-native model — defer, don't build a half version here).
- The `protocolVersion` check would need to *downgrade* behavior to keep an old
  runner working (never silently degrade — refuse with a message).
- Making liveness correct forces real **multi-runner routing** (that's PR5 —
  PR3 keeps single-active routing).

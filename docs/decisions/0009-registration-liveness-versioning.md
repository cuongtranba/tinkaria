# 0009 Cross-machine Registration & Liveness + Protocol Versioning (Personal Runners PR3)

Date: 2026-05-26

## Status

Accepted (design) — implementation in progress on `feat/personal-runners-pr3-liveness`.

## Context

PR3 (concept #7 liveness, #9 versioning) makes runner liveness correct across
machines and adds a protocol handshake. Current state (PR2 base):
`RunnerRegistration = {runnerId, pid, startedAt, providers}`; liveness is a 30s
boolean for the active runner and **`process.kill(pid,0)`** in the discover path
(meaningless for paired runners on other hosts); no `protocolVersion`; no gate at
turn start. PR2 made multiple paired runners possible, so the registry can hold
several entries.

## Decision

1. **Heartbeat-TTL liveness, uniform for all runners.** A pure
   `runnerLivenessState(lastHeartbeatAt, now)` → `online` (`<25s`) / `degraded`
   (`25–60s`) / `offline` (`≥60s`). The `degraded` band (≈2 missed 10s beats)
   stops flapping on a GC/wifi blip. The discover path uses this, **not `pid`**.
   `pid` stays as informational only.
2. **Protocol-version handshake.** `PROTOCOL_VERSION` constant + `SUPPORTED_RANGE`
   `{min,max}` (today `min=max`). The runner reports `protocolVersion` in
   registration; the server marks out-of-range runners **`incompatible`** — a
   distinct state, not "offline".
3. **Fail fast, never silently degrade.** An `incompatible` runner **blocks turn
   start** with a clear, client-visible message ("run `tinkaria-runner upgrade`").
   No auto-update (concept-rejected); no silent downgrade.
4. **`RunnerRegistration` additive** (`protocolVersion` required going forward,
   `capabilities?` shape-only). `lastHeartbeatAt` stays **server-side** (not
   written to KV every 10s). Old/missing-field entries → incompatible/offline,
   self-healing on re-registration. No migration.
5. **`/health` `runner`** gains `state` + `protocolVersion` + `incompatible`;
   `heartbeatFresh` kept (`== state==="online"`) for back-compat.

## Consequences

- Cross-machine (paired) runners are correctly observable; the single liveness
  mechanism replaces the same-machine-only `pid` check.
- A version skew fails fast with guidance instead of an opaque turn failure.
- Shape change is additive + ephemeral (KV re-registered) — no migration risk.

## Deferred

- **Suspend-session / resume-from-branch / "needs attention after 30 min"**
  (concept #7) — needs the git-native session model (**PR6/PR7**). PR3 = detection
  + states only.
- **Rich capability probing + command profile split** — **PR4** (PR3 adds the
  `capabilities` field shape only).
- **Multi-runner routing / picker** — **PR5** (PR3 keeps single-active routing;
  only makes registry liveness correct with several runners present).
- **`ownerId`** — deferred (no user-identity system; decision 0008).
- Must rebase onto corrected PR1/PR2 tips before integration (harness backlog #4).

## Verification

Pure state-fn boundary table; incompatible computation; turn-start block (refused
with message, not dispatched); discover path no longer calls `process.kill`; live
`/health` shows `online`+`protocolVersion`; a skewed-version runner →
`incompatible` + blocked turn. PR1/PR2 suites stay green. See
`docs/stories/personal-runners/PR3-registration-liveness/validation.md`.

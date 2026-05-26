# Validation — PR3 Registration & Liveness + Versioning

## Proof Strategy

PR3 is done when liveness is a correct, cross-machine, heartbeat-derived state
(online/degraded/offline) with no `pid` dependence, and a protocol-version skew is
loudly `incompatible` and **blocks turn start** with a clear message — proven by a
pure-function table, injected-time integration tests, and a live runner showing
`online` + a version-bumped runner being refused.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | `runnerLivenessState(lastHeartbeatAt, now)`: boundaries — `age=0`→online; `24_999`→online; `25_000`→degraded; `59_999`→degraded; `60_000`→offline; `lastHeartbeatAt=null`→offline. `isProtocolSupported`: in-range→true; below `min`/above `max`→false. |
| Integration | Server reads a registration with `protocolVersion=PROTOCOL_VERSION` → not incompatible; with an out-of-range version → `incompatible=true`. Discover path treats an `offline` (stale-heartbeat) registry entry as dead (no `process.kill`). Turn-start gate: incompatible runner → `start_turn` refused with the message, never dispatched. |
| E2E | Live runner (spawned + a paired one) shows `state:"online"` + correct `protocolVersion` in `/health`/registry. A runner started with a bumped `PROTOCOL_VERSION` (simulating skew) → `incompatible` + a chat turn is blocked with the upgrade message (not an opaque failure). |
| Platform | (Bounded) — degraded/offline transitions proven via injected `lastHeartbeatAt` rather than a real 60s wait; a real kill→offline check is optional/slow. |

## Fixtures

- Injected `now` / `lastHeartbeatAt` for the state-function + transition tests.
- A `PROTOCOL_VERSION`-override env (e.g. `RUNNER_PROTOCOL_VERSION`) so a test can
  start a runner reporting a skewed version without code changes.
- Dedicated HTTP/NATS ports + temp `NATS_DATA_DIR` + `TINKARIA_RUNNER_HOME`. Never `:3210`.

## Commands

```text
bunx @typescript/native-preview --noEmit -p tsconfig.json
bun test src/shared   # liveness state fn + protocol support (pure)
bun test src/server   # incompatible computation + turn-start gate + /health
bun test src/nats/    # PR1/PR2 still green
# live (dedicated port): boot, curl /health → runner.state=online, protocolVersion set;
# start a runner with a skewed RUNNER_PROTOCOL_VERSION → /health incompatible + turn blocked
```

## Acceptance Evidence (2026-05-26 — team-lead independent gate, dedicated ports)

- **Liveness state boundary table:** `runner-protocol.test.ts` 25/25 (0→online,
  24999→online, 25000→degraded, 59999→degraded, 60000→offline, null→offline) +
  `isProtocolSupported` in/below/above range.
- **Live runner `/health`** (port 3281): `{ ok:true, state:"online",
  protocolVersion:1, incompatible:false, heartbeatFresh:true }`.
- **Skew runner** (`RUNNER_PROTOCOL_VERSION=999`): `/health` →
  `{ ok:false, state:"online", protocolVersion:999, incompatible:true }`; server
  logged `Runner <id> is incompatible (protocol v999, server supports v1–1)`.
- **Turn-start block:** `runner-incompatible-gate.test.ts` — incompatible runner
  → `sendCommand("start_turn")` throws the upgrade message and the NATS dispatch
  is **not** called.
- **Discover path:** uses `runnerLivenessState(reg.lastSeenAt, now) !== "offline"`
  (no `process.kill`); `pr3-liveness.test.ts` covers stale→not-adoptable /
  fresh→adoptable; runner stamps `lastSeenAt` in its KV entry each heartbeat.
- **Typecheck** clean (`-p tsconfig.json`, 0 errors); `src/nats/` 60/0 (PR1/PR2
  green, no regression).

**Not locally exercised (single host):** a paired runner on a *second* machine
going degraded→offline over real time (covered by the pure-fn + injected-clock
tests instead).

**Full-suite note:** ~20 pre-existing failures on this branch are NOT PR3
regressions — the `server.test.ts` healthcheck "no output" was the callout
`NATS_DATA_DIR` default bug (fixed on PR1 `e07df74`, inherited on rebase); the
runner-registration test passes in isolation (parallel-NATS flake); the rest are
client-UI / browser-journey (agent-browser PATH) tests untouched by PR3.

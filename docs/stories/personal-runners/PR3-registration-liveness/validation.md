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

## Acceptance Evidence

Add after verification: the liveness-state boundary table passing; `/health`
showing `state:"online"` + `protocolVersion` for a live runner; an `incompatible`
runner's `/health` + the blocked turn-start message; the discover path no longer
calling `process.kill`; PR1/PR2 suites still green.

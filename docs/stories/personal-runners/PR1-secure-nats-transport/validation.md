# Validation — PR1 Secure NATS Transport & Isolation

## Proof Strategy

PR1 is done only when **NATS itself** (not app code) refuses a connection that
reaches outside its scope, AND normal sessions still work end-to-end over the
new scoped creds. Both signals must agree (dual-signal rule). The decisive proof
is the **negative test**: a `runner`-class credential is *denied* on another
`runnerId`'s subject. A green happy path alone does **not** prove isolation.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Callout responder: valid cred → correct scoped JWT per class; runner cred carries `runnerId`; invalid/expired cred → rejection. Subject-policy builder: class → exact allow lists. |
| Integration | (1) Orchestrator connects with `server-admin` creds and operates streams/KV. (2) Server-spawned runner connects with its scoped creds, heartbeats, receives `start_turn`. (3) **Negative:** a runner creds for `runnerId=A` is refused publish/subscribe on `runtime.runner.cmd.B.>` and on B's registry key (NATS permissions violation). (4) `ui-client` creds cannot publish to a runner-cmd subject. |
| E2E | browser-harness: load app over the tailnet-bound NATS, start a session, agent turn round-trips, events render — all on scoped creds. |
| Platform | Off-box reachability: a runner on a second tailnet host connects to the advertised WS URL and registers. WireGuard down → connection fails closed. |
| Performance | Callout adds one round-trip at connect only; assert steady-state pub/sub latency unchanged and reconnect storms don't overload the responder. |
| Logs/Audit | Every callout decision audited (identity, class, runnerId, grant/deny); rejected-connection + permissions-violation counters observable; callout health in `/health`. |

## Fixtures

- Deterministic `runnerId` pair `A` / `B` for the cross-runner negative test.
- A fixed `ui-client` credential and a `server-admin` credential.
- A second tailnet host (or a simulated remote interface) for the platform case.
- Known signing key seed for the callout in the test `NATS_DATA_DIR`.

## Commands

Add commands after scripts exist.

```text
# typecheck
bunx @typescript/native-preview --noEmit -p tsconfig.json
# focused tests (names TBD as files land)
bun test src/nats        # callout responder + subject policy
bun test src/server      # orchestrator + /auth/token credential
bun test src/runner      # scoped runner connect
# running app, dual-signal
bun run dev & curl -s localhost:3210/health   # natsDaemon/natsConnection/runner + callout healthy
# negative isolation proof (script TBD): runner-A creds on subject B → expect permissions error
```

## Acceptance Evidence

Add results after verification. Must include:

- `/health` 200 with natsDaemon + natsConnection + runner + callout healthy.
- browser-harness screenshot of a completed turn over scoped creds.
- Captured NATS **permissions-violation** error from the cross-runner negative
  test (the isolation proof), plus the audit log line for that denied decision.

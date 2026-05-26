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

### Stage C — Tailnet Bind + Guard (2026-05-26)

**Typecheck:** `bunx @typescript/native-preview --noEmit -p tsconfig.json` — clean (no errors).

**Tests:** `bun test src/nats/ src/server/nats-bind-guard.test.ts ...` — 66 pass, 0 fail.
(4 pre-existing failures in `nats-daemon-manager.test.ts` from Stage B: tests call `ensureDaemon`
without `NATS_DATA_DIR`; not introduced by Stage C.)

**Wide bind + callout works:**
```
NATS_DATA_DIR=/tmp/pr1c-stage-c2 NATS_AUTH_MODE=callout bun run src/server/cli.ts --no-open --port 3296 --strict-port --remote
```
Server log: `Binding NATS to 0.0.0.0 in callout mode — confidentiality via WireGuard, WS no_tls within the tailnet`
`/health` → `{"ok":true,"status":"ok",...,"natsDaemon":{"url":"nats://0.0.0.0:53120","wsUrl":"ws://0.0.0.0:53119",...,"ok":true},"natsConnection":{"ok":true},"runner":{"ok":true,...}}`
All three signals healthy. NATS TCP + WS both bound to 0.0.0.0.

**Guard fires (non-loopback + token):**
```
NATS_DATA_DIR=/tmp/pr1c-guard NATS_AUTH_MODE=token bun run src/server/cli.ts --no-open --port 3298 --strict-port --remote
```
Output (exit 1):
```
error: Refusing to bind NATS to 0.0.0.0 in token mode — a shared-token bus must not be exposed beyond loopback; set NATS_AUTH_MODE=callout
```

**Loopback + token (regression):**
```
NATS_DATA_DIR=/tmp/pr1c-stage-c NATS_AUTH_MODE=token bun run src/server/cli.ts --no-open --port 3297 --strict-port
```
`/health` → `{"ok":true,"status":"ok",...}` — all three signals healthy, no guard triggered.

### Stage D — Acceptance (2026-05-26, PR1 complete)

Verified by team-lead via independent boots on dedicated ports (never :3210):

- **Isolation proof (decisive):** `bun test src/nats/auth-callout/callout.integration.test.ts`
  → `runner-A denied on runtime.runner.cmd.runner-B.start — connection closed by
  NATS`; denied on `$KV.runtime_runner_registry.runner-B`; `ui-client denied on
  runtime.runner.cmd`; unknown cred → `Authorization Violation`. Audit:
  `decision=grant/deny class=… runnerId=…`.
- **Suite:** 77 pass / 0 fail across `src/nats` + bind-guard + daemon-manager; typecheck clean.
- **App in callout mode (default):** `/health` → `{ok:true, natsDaemon:ok,
  natsConnection:ok, runner:{ok,registered,heartbeatFresh}}`; `/auth/token` →
  stateless `{c:"ui-client",iat,exp}` (30d TTL).
- **ui-client scope:** exercised at the NATS-WS layer incl. the JetStream chat
  consumer — sufficient; scoped to `KANNA_CHAT_MESSAGE_EVENTS`.
- **Tailnet guard:** wide bind + callout → ALIVE/healthy (bound 0.0.0.0); wide
  bind + token → REFUSED (`Refusing to bind NATS to 0.0.0.0 in token mode…`);
  loopback + token → unchanged.
- **Review fixes:** HMAC buffer-offset, token `exp`, responder catch, stderr
  cleanup, key files `-rw-------`, case-insensitive guard.

**Not exercised locally (single host):** off-box second-host reachability +
WireGuard-down path (platform test deferred). **Not run:** full headless-browser
pixel E2E (NATS-WS-layer ui-client proof used instead). Both noted in TEST_MATRIX.
Deferred security items (PR2 gates) listed in decision 0007.

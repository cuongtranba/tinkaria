# Validation — PR2 Runner Identity & Pairing

## Proof Strategy

PR2 is done when a member can pair an **externally-launched** runner end-to-end:
issue a code, redeem it once for a durable credential, start the runner from that
stored credential, and see it connect through the PR1 callout and register —
while bad/expired/reused codes are rejected and the paired runner is scoped
exactly like a spawned one (cross-runner isolation, from PR1, still holds).

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Code store: issue returns code+expiry; exchange consumes (second exchange → gone); expired code → rejected; unknown code → rejected. Credential file read/write (`0600`); env-vs-file token resolution precedence. |
| Integration | `POST /api/pairing/code` (callout mode) → code; `POST /api/pairing/exchange` → `{runnerId, token, natsUrl}`; the returned token verifies via the PR1 callout (`verifyCredentialToken` → `{class:"runner", runnerId}`); token-mode → `409`. Reused/expired code → `410`. |
| E2E | Boot app (callout default, dedicated port). Issue a code. Start an externally-launched runner from the exchanged credential (no server spawn). Confirm it appears in `runtime_runner_registry`, heartbeats, and `/health` (or the registry) shows it registered. Pair a **second** runner → both present with distinct runnerIds. |
| Platform | Credential file written `0600` under `~/.tinkaria/` (or `TINKARIA_RUNNER_HOME`); runner starts from it with no env token. |
| Security | Pairing code is single-use + short-TTL + unguessable; exchange is atomic (no double-redeem race). Durable token TTL = `RUNNER_PAIR_TTL`. Endpoints public (documented posture). |
| Isolation (reuse PR1) | A paired runner-A credential is still DENIED by NATS on runner-B's `runtime.runner.cmd.B.>` / KV key — the callout integration test continues to pass (paired runners use the same `{class:runner}` scope). |

## Fixtures

- A deterministic code (inject the RNG/clock) for single-use + expiry unit tests.
- A temp `TINKARIA_RUNNER_HOME` for the credential-file tests.
- A dedicated HTTP + NATS port set; a temp `NATS_DATA_DIR`. Never `:3210`.

## Commands

```text
bunx @typescript/native-preview --noEmit -p tsconfig.json
bun test src/server   # pairing endpoints + code store
bun test src/runner   # credential file + start-from-credential
bun test src/nats/    # PR1 isolation still green (paired runners reuse the scope)
# running app, dual-signal (dedicated port):
NATS_DATA_DIR=/tmp/pr2 bun run ./src/server/cli.ts --no-open --port 3287 --strict-port &
curl -s localhost:3287/api/pairing/code        # → {code,expiresAt}
curl -s -XPOST localhost:3287/api/pairing/exchange -d '{"code":"…"}'  # → credential
# start paired runner from the stored credential; confirm registry + heartbeat
```

## Acceptance Evidence

Add after verification. Must include: the issued code + successful exchange; the
externally-launched runner's callout `decision=grant class=runner:<id>` line and
its registry entry/heartbeat; a rejected reused/expired code; the `0600` secret
file; and the PR1 isolation test still green.

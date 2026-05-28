# US-RPAH Pairing exchange advertises a routable NATS host

## Status

in_progress

## Lane

normal

## Product Contract

When a runner pairs with the server, the credential it receives must contain a
NATS URL that is reachable **from the runner's machine**. The pairing exchange
must never hand out the wildcard bind host (`0.0.0.0` / `::`), because a remote
runner would dial its own loopback and get `ECONNREFUSED`.

## Relevant Product Docs

- `docs/TEST_MATRIX.md`
- Decision 0008 (pairing transport security — referenced in `runner-pair.ts`)

## Acceptance Criteria

- `POST /api/pairing/exchange` rewrites the credential's `natsUrl` / `natsWsUrl`
  host to `NATS_ADVERTISED_HOST` when that env var is set (matching the existing
  `/auth/token` behavior at `server.ts:931`).
- When the daemon is bound to a wildcard host (`0.0.0.0`, `::`, `[::]`) **and**
  `NATS_ADVERTISED_HOST` is not set, the exchange fails with a clear, actionable
  error (HTTP 409) instead of returning an unroutable URL.
- When the daemon is bound to a concrete host (e.g. `127.0.0.1` for same-machine
  pairing, or a LAN/tailnet IP), behavior is unchanged: the URL passes through.
- Existing pairing tests (code/exchange round-trip, consumed, unknown, token
  mode) still pass.

## Design Notes

- Commands: —
- Queries: —
- API: `POST /api/pairing/exchange` response `natsUrl` / `natsWsUrl` values
  (response *shape* unchanged; only the host portion of the values changes).
- Tables: —
- Domain rules: a paired runner is potentially remote → its NATS URL host must be
  routable from another machine. Wildcard bind hosts are never routable targets.
- UI surfaces: —

New pure helper `src/server/runner-pairing-urls.ts :: resolveRunnerPairingUrls()`
returns a discriminated `{ ok: true, natsUrl, natsWsUrl } | { ok: false, error }`.
Self-contained (local `rewriteUrlHost`) so its unit test does not pull in the
native `@lagz0ne/nats-embedded` dep via `nats-bridge.ts`.

Out of scope (logged to backlog): the embedded daemon uses an ephemeral NATS port
(`NATS_PORT` default `-1`), so a stored credential's port goes stale on server
restart. Separate durability fix.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `runner-pairing-urls.test.ts`: advertised-host rewrite; wildcard reject (0.0.0.0, ::, [::]); concrete-host passthrough; ws + tcp both rewritten. |
| Integration | `pairing-endpoints.test.ts`: existing suite green; new case — bound 0.0.0.0 with no advertised host → 409; with `NATS_ADVERTISED_HOST` set → natsUrl host equals advertised host. |
| E2E | Manual: pair a runner from a second machine over LAN/tailnet; runner connects (no ECONNREFUSED). |
| Platform | — |
| Release | — |

## Harness Delta

- Intake #17 recorded.
- TEST_MATRIX rows added.
- Backlog item added for ephemeral NATS port durability.

## Evidence

To be filled after validation runs (typecheck + `bun test`).

# Overview — PR1 Secure NATS Transport & Isolation

Part of the **Personal Runners** initiative (`../change-request.md`), epic PR1.
This is the foundational epic: every later epic assumes scoped NATS credentials.

## Current Behavior

- The embedded NATS daemon (`src/nats/nats-daemon.ts`) binds to `NATS_HOST`,
  **default `127.0.0.1`** — reachable only from the same box. WebSocket runs with
  `no_tls: true`.
- Authentication is a **single shared token** (`src/nats/nats-token.ts`,
  generated in `server.ts` `generateAuthToken()` / read from `nats.token`).
  The *same* token authenticates **all** clients:
  - the Bun server's own orchestrator connection (`NatsConnector.connect`),
  - every browser WS client (fetched from **`GET /auth/token`**, which is
    **unauthenticated** and returns the raw token), and
  - the runner process (`connectRunner({ token })`, spawned by `runner-manager`).
- With one token and no per-subject scoping, **any holder can publish/subscribe
  to any subject** — including another runner's command subject
  (`runtime.runner.cmd.{runnerId}.>`), the registry KV, and all events.
- The `RUNNER_MODE=discover` seam exists but assumes the runner shares the
  server's NATS/host.

## Target Behavior

- NATS is reachable by **off-box runners over the Tailscale tailnet** (bind the
  tailnet interface, advertise the correct WS URL). Confidentiality comes from
  WireGuard; no new TLS layer is added.
- Authentication becomes **per-connection scoped credentials** issued by a
  server-side **auth-callout** responder. Each connection is constrained by NATS
  itself (not app code) to only the subjects it needs:
  - **server-admin** — broad scope for the orchestrator,
  - **ui-client** — subscribe to events / publish UI commands,
  - **runner** — only its own `runtime.runner.cmd.{runnerId}.>`, its heartbeat
    subject, and its own registry key.
- A holder of one connection's credential **cannot** touch another runner's
  subjects. This is the real multi-tenant isolation that unblocks both personal
  runners (PR2+) and the parked external-team path.

## Affected Users

- **Devs / QA / PM** — transparent; sessions keep working, now over scoped creds.
- **Operators** — must run NATS bound to the tailnet; may run an external
  `nats-server` if the embedded wrapper can't do auth-callout (see `design.md`).

## Affected Product Docs

- `docs/stories/personal-runners/change-request.md` (initiative)
- `docs/decisions/0007-secure-nats-transport-isolation.md`
- `docs/ARCHITECTURE.md` (NATS transport/auth section — update when implemented)

## Non-Goals

- **Per-runner identity / pairing tokens** — PR2. PR1 scopes the
  *server-spawned* runner (server knows its `runnerId` at spawn and mints its
  creds); PR1 only defines the per-runner subject **policy** that paired runners
  will reuse.
- **Per-user browser identity** — PR1 gives the browser a single `ui-client`
  scope class, not per-`TinkariaUser` scoping.
- **WebSocket bridge for external (non-tailnet) teams** — parked; unblocked by
  this epic's isolation but not built here.
- **Changing `RunnerRegistration` shape / liveness** — PR3.

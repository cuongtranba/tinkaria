# 0007 Secure NATS Transport & Per-Connection Isolation (Personal Runners PR1)

Date: 2026-05-26

## Status

Proposed

## Context

Personal Runners (initiative `docs/stories/personal-runners/change-request.md`)
requires each member's runner to connect to the shared Tinkaria NATS bus from
their own machine, without being able to touch another runner's traffic. Today:

- The embedded NATS daemon (`src/nats/nats-daemon.ts`) binds `127.0.0.1` by
  default and uses a **single shared token** (`src/nats/nats-token.ts`).
- That one token authenticates the orchestrator (`NatsConnector`), every browser
  (via the unauthenticated `GET /auth/token`), and the runner
  (`connectRunner` / `runner-manager` spawn) — so any holder can drive any
  subject, including `runtime.runner.cmd.{otherRunnerId}.>` and the registry KV.
- `@lagz0ne/nats-embedded`'s `NatsServer.start()` exposes only
  `{ host, port, websocket, jetstream, httpPort, storeDir, token }` — **no
  visible auth-callout / operator-JWT option.**

PR1 is sequenced first because every later epic assumes scoped credentials.

## Decision

1. Adopt **NATS auth-callout** as the isolation mechanism: a server-side
   responder validates each connection's credential and returns a **scoped user
   JWT**. NATS enforces subject permissions; app code does not.
2. Define three connection classes with fixed subject scopes — `server-admin`,
   `ui-client`, and `runner` (scoped to one `runnerId`) — per
   `docs/stories/personal-runners/PR1-secure-nats-transport/design.md`.
3. Bind NATS to the **tailnet interface** and land that bind **together with**
   the callout (never expose a shared-token bus on the tailnet). Confidentiality
   is provided by **WireGuard**; WS `no_tls` may remain within the tailnet as a
   documented trust assumption.
4. **Open fork, decided by a time-boxed spike (Phase 1):**
   - **Path A** — embedded `@lagz0ne/nats-embedded` *if* it can express
     auth-callout via raw config / operator JWT passthrough. Preferred (keeps
     single-binary ops).
   - **Path B** — run an external `nats-server` configured with `auth_callout`,
     reusing the existing `NATS_MODE=external` seam. Accepted if A is infeasible.
   - Fallback — static per-account NATS users if callout is unavailable on both;
     loses dynamic per-`runnerId` scoping and does not extend to PR2.
5. PR1 scopes only the **server-spawned** runner (`runner-manager` mints its
   scoped creds at spawn). Per-user pairing creds are **PR2**; the subject policy
   is unchanged between them.

## Consequences

- The callout becomes the auth path for **all** NATS connections (browser,
  orchestrator, runner) — larger surface than today, but real multi-tenant
  isolation, and it unblocks the parked external-team WS-bridge path.
- New server-held secret: the callout **signing key** (stored alongside
  `nats.token` in `NATS_DATA_DIR`, not in git). Key rotation is a follow-up.
- Client-visible contract change: `GET /auth/token` returns a `ui-client`
  credential instead of the shared admin token; `nats-socket.ts` must adapt.
- If Path B: operators must run an external `nats-server` — an ops change to
  confirm with the human at the spike gate.
- C3 architecture docs: this decision predates implementation; update
  `docs/ARCHITECTURE.md` and C3 topology when PR1 lands.

## Verification

Decisive proof is the **negative isolation test**: a `runner` credential for
`runnerId=A` is refused (NATS permissions violation) on `runtime.runner.cmd.B.>`
and on B's registry key, while the happy-path session still round-trips over
scoped creds. Dual-signal per `CLAUDE.md`: `/health` (incl. callout) + a
browser-harness session + the captured permissions-violation error and its audit
line. See `docs/stories/personal-runners/PR1-secure-nats-transport/validation.md`.

# Exec Plan — PR1 Secure NATS Transport & Isolation

## Goal

Replace the single shared NATS token + localhost-only bind with (a) a tailnet
bind reachable by off-box runners and (b) **per-connection scoped credentials**
issued by a server-side auth-callout, so NATS itself enforces that each
connection can only touch its own subjects.

## Scope

In scope:

- Spike + decision on auth-callout feasibility with `@lagz0ne/nats-embedded`
  vs. the `NATS_MODE=external` `nats-server` path (gates the rest of PR1).
- Auth-callout responder service in the Bun server (validate credential → mint
  scoped JWT).
- Subject-scoping policy for three connection classes: **server-admin**,
  **ui-client**, **runner** (per-`runnerId`).
- Migrate the three existing connections onto callout creds: orchestrator
  (`NatsConnector`), browser (`/auth/token` → per-connection user creds),
  server-spawned runner (`runner-manager` mints scoped creds at spawn).
- Bind NATS to the tailnet interface; advertise the correct WS URL.

Out of scope:

- Pairing tokens / per-runner *identity* (PR2) — PR1 only scopes the
  server-spawned runner and defines the policy paired runners reuse.
- Per-`TinkariaUser` browser scoping; the WS bridge; `RunnerRegistration`/
  liveness changes (PR3); any git/workspace changes.

## Risk Classification

Risk flags: Auth, Authorization, Audit/security, External systems (NATS bind /
possible external `nats-server`), Public contracts (`/auth/token` response,
connection credential shape), Existing behavior (every NATS connection changes),
Cross-platform (off-box runner), Multi-domain (transport + auth).

Hard gates: **Auth, Authorization, Audit/security** → high-risk, confirmed.

## Work Phases

1. **Discovery / spike** — Determine whether `@lagz0ne/nats-embedded` can run an
   auth-callout (raw config / operator JWT passthrough). Time-boxed. Output:
   Path A (embedded) or Path B (external `nats-server`). **Stop for human
   confirmation here** — this changes the deployment shape.
2. **Design lock** — Finalize subject-scoping matrix and credential lifecycle in
   `design.md`; record the Path A/B fork in decision `0007`.
3. **Validation planning** — Write the JWT-scope enforcement test plan
   (negative tests: cross-runner subject access is *denied* by NATS) before code.
4. **Implementation** — Callout responder → migrate orchestrator → migrate
   server-spawned runner → migrate browser → bind tailnet interface. Land
   bind + callout together (never expose a shared-token bus on the tailnet).
5. **Verification** — Dual-signal per `CLAUDE.md`: `/health` green
   (natsDaemon/natsConnection/runner) + browser-harness session round-trip over
   scoped creds; plus an explicit **negative** proof that a runner-class creds
   is refused on another runnerId's subject.
6. **Harness update** — story/decision/trace recorded; TEST_MATRIX rows proven;
   backlog friction logged.

## Stop Conditions

Pause for human confirmation if:

- The spike shows the embedded server cannot do auth-callout (Path B changes ops
  — run an external `nats-server`).
- Migrating `/auth/token` would require introducing browser user-auth that does
  not exist yet (scope creep into a new auth surface).
- Any step would weaken isolation "temporarily" (e.g. ship the tailnet bind
  before the callout) — not allowed.
- WireGuard-only confidentiality (keeping `no_tls`) is judged insufficient and
  TLS is demanded (re-scope).

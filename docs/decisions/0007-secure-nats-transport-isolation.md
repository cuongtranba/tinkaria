# 0007 Secure NATS Transport & Per-Connection Isolation (Personal Runners PR1)

Date: 2026-05-26

## Status

Accepted — Path A confirmed by the Phase-1 spike (2026-05-26). See "Spike Result".

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
4. **Fork resolved by the Phase-1 spike → Path A.** Use the embedded
   `@lagz0ne/nats-embedded` bundled binary (official `nats-server` **v2.12.5**,
   well past the 2.10 auth-callout floor). **Integration caveat:** drive the
   bundled binary (`resolveBinary()`) with our **own generated callout config**
   and discover ports directly — do **not** use the wrapper's `websocket` option
   together with `config:` (it writes an `include '<abs-path>'` that nats-server
   mis-resolves against the temp-config dir; see "Spike Result"). This keeps the
   single-binary deployment (no external `nats-server`, so the ops-change gate is
   moot). Path B (external `nats-server`) is the documented fallback only if we
   later need it; static per-account users remain the last-resort fallback.
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

## Spike Result (2026-05-26, Phase 1)

Run in the PR1 worktree against the bundled binary (throwaway probe, removed):

1. **Binary capability.** `resolveBinary()` →
   `@lagz0ne/nats-embedded-darwin-arm64/nats-server`, **v2.12.5**. The wrapper is
   a thin manager over the *official* `nats-server`, with `config:` / `args:`
   escape hatches and `NATS_EMBEDDED_BINARY` override — so auth-callout (a
   standard 2.10+ feature) is available.
2. **Callout enforced (running proof).** Started the bundled binary directly with
   an `authorization { auth_callout { issuer, auth_users, account } }` + `accounts`
   config. Server reached "Server is ready". Then:
   - a **normal client** (`alice`) → **`Authorization Violation`** (callout fires,
     no responder answers → connection denied — proves the server *enforces* the
     callout), and
   - the `auth_service` user listed in `auth_users` → **connected** (documented
     callout bypass for the responder's own account).
3. **Wrapper bug found.** Using the wrapper's `websocket: true` **and** `config:`
   together makes `buildConfig` emit `include '<absolute-config-path>'` into a
   temp file; nats-server joins that onto the temp-config dir
   (`/tmp/.../Volumes/.../callout.conf`) → "error parsing include file … no such
   file". So the callout config must **not** be delivered via that combination.
4. **Port discovery.** The wrapper learns `wsPort` only when *its own*
   `websocket` option is set (it waits on the WS "Listening" stderr line). Passing
   a self-contained config (with a `websocket{}` block) via `config:` alone makes
   WS-port discovery racy. → drive the binary directly and parse ports / use a
   ports file (`portsFileDir`), the shape `nats-daemon.ts` already uses.

**Remaining implementation risk (next, not blocking the fork):** the callout
**responder** must return a *signed user JWT*. `@nats-io/nkeys` (2.0.3) is
present; **`@nats-io/jwt` is not installed** and must be added. The canonical
nats.js auth-callout example (nkeys + jwt `encodeUser` / authorization-response
encoding) is the reference. This is standard, documented work — not a research
risk.

## Verification

Decisive proof is the **negative isolation test**: a `runner` credential for
`runnerId=A` is refused (NATS permissions violation) on `runtime.runner.cmd.B.>`
and on B's registry key, while the happy-path session still round-trips over
scoped creds. Dual-signal per `CLAUDE.md`: `/health` (incl. callout) + a
browser-harness session + the captured permissions-violation error and its audit
line. See `docs/stories/personal-runners/PR1-secure-nats-transport/validation.md`.

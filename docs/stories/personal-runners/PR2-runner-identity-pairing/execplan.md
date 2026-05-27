# Exec Plan — PR2 Runner Identity & Pairing

## Goal

Let a member bring their own externally-launched runner: issue a one-time
pairing code, exchange it for a durable runner credential, and have that runner
connect through the PR1 callout and register — without the server spawning it,
and without an owner/identity system (deferred).

## Scope

In scope:

- **Pairing code issue** endpoint (`POST /api/pairing/code`) → short-lived,
  single-use code; server allocates a `runnerId` and mints its durable PR1-format
  runner credential token now, keyed by the code.
- **Pairing exchange** endpoint (`POST /api/pairing/exchange`) → redeem code →
  return `{ runnerId, token, natsUrl, natsWsUrl }`; consume the code.
- **Code store**: short-TTL, single-use, in-memory (pilot) — maps code →
  `{ runnerId, token }`.
- **Runner-side pairing**: a `pair` path that stores the credential at
  `~/.tinkaria/runner-secret.json` (`0600`), and a **start-from-stored-credential**
  path so an externally-launched runner loads it, connects via the callout, and
  registers (`RUNNER_MODE=discover` self-registration).
- **"Add my runner"** UI affordance to call the issue endpoint and show the code.
- Multiple paired runners.

Out of scope (see overview Non-Goals): `ownerId`, user auth, distribution/PR8,
liveness/PR3, routing/PR5, credential refresh.

## Risk Classification

Risk flags: Auth (pairing code → durable credential; new auth path),
Public contracts (2 new endpoints + runner credential file + runner start mode),
Existing behavior (runner launch model: spawned → also externally-paired),
Cross-platform (runner on a member machine), Audit/security (code is a bearer
secret that yields a long-lived NATS credential).

Hard gate: **Auth** → high-risk, confirmed.

## Work Phases

1. **Design lock** — this packet + decision 0008. Done before code.
2. **Validation planning** — test plan: code is single-use + expires; exchange
   returns a working credential; a paired runner connects + registers via the
   callout; the credential is scoped exactly like a spawned runner (cross-runner
   isolation still holds — reuses PR1's proof); secret file `0600`.
3. **Implementation** — Stage 1 (server: endpoints + code store + mint); Stage 2
   (runner-side pair/store + externally-launched connect+register; UI trigger).
4. **Verification** — dual-signal: boot app (callout default), issue a code via
   the endpoint, run a paired runner from the stored credential on a dedicated
   port, confirm it connects + appears in the registry + heartbeats; confirm a
   bad/expired/reused code is rejected.
5. **Review** — security review of the pairing path (code entropy/TTL/single-use,
   the unauthenticated endpoints, durable-token TTL, local secret perms).
6. **Harness update** — story/decision/trace/TEST_MATRIX/backlog.

## Stop Conditions

Pause for human confirmation if:

- The design needs an owner/identity concept after all (it should not — deferred).
- The pairing endpoints would need real user-auth to be safe enough even for the
  pilot (escalate; auth is a separate initiative).
- The durable-credential model would require server-side per-runner secret
  storage (it should not — the PR1 token is stateless/self-verifying).
- Reusing PR1's runner scope would need widening for paired runners (it should
  not — same `{class:runner, runnerId}`).

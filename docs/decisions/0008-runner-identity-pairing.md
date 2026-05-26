# 0008 Runner Identity & Pairing — pairing mechanism, ownerId deferred (Personal Runners PR2)

Date: 2026-05-26

## Status

Accepted (design) — implementation in progress on `feat/personal-runners-pr2-pairing`.

## Context

PR2 of Personal Runners (`docs/stories/personal-runners/change-request.md`) is to
let a member bring their own runner: "Add my runner" → one-time pairing code →
durable per-runner secret bound to their **TinkariaUser**, with multiple runners
per user (feeding routing in PR5).

**Investigation finding (blocking):** the app is **single-tenant with no
user-identity system** — no `TinkariaUser`, no login/session, no per-user auth;
the only identity primitive is machine name (`getMachineDisplayName`). PR1's
security review independently flagged that `/auth/token` is unauthenticated for
the same reason. So "bind to their TinkariaUser" cannot be implemented as written.

PR2 stacks on PR1's auth-callout: PR1 already verifies a stateless runner
credential token `{c:"runner", r:runnerId}` (HMAC over the server `tokenSecret`)
and scopes it to that runnerId. PR1 mints this for *server-spawned* runners.

## Decision

1. **Build the pairing mechanism; defer `ownerId`** (confirmed with the human).
   A paired runner is "a known external runner" — no owner concept. Do **not**
   add `ownerId` to `RunnerRegistration`. Owner grouping + the routing it feeds
   (PR5) wait for a real user-identity initiative.
2. **The durable runner credential is a PR1 credential token** minted at code
   issue with a long TTL (`RUNNER_PAIR_TTL`, default 90d). It is self-verifying
   via PR1's callout → **no server-side per-runner secret store**. Paired runners
   reuse the exact `{class:"runner", runnerId}` scope (no scope widening).
3. **Two endpoints** — `POST /api/pairing/code` (issue: allocate runnerId, mint
   token, return a short single-use code) and `POST /api/pairing/exchange`
   (redeem once → return `{runnerId, token, natsUrl, natsWsUrl}`). Public, same
   posture as `/auth/token`; the **code is the bearer secret** (short TTL +
   single-use + unguessable). Pairing requires callout mode (else `409`).
4. **Code store** is in-memory, short-TTL, single-use (pilot). Restart loses
   pending codes (10-min window — re-issue). EventStore persistence deferred.
5. **Runner credential** persisted at `~/.tinkaria/runner-secret.json` (`0600`);
   the externally-launched runner loads it and connects (env still wins for
   spawned runners). The runner self-registers (`RUNNER_MODE=discover`).
6. Keep the token payload at PR1's `{c,r}` shape so adding `o:ownerId` later is
   **non-breaking** when a user system exists.

## Consequences

- Delivers PR2's core value (member brings their own runner) without blocking on
  an auth subsystem.
- The pairing endpoints are unauthenticated — acceptable for the single-machine /
  trusted-tailnet pilot (the code is the secret), **must be gated on user auth
  before any untrusted multi-tenant exposure** (tracked with PR1's deferred
  `/auth/token` auth).
- Durable token TTL bounds a leaked credential to `RUNNER_PAIR_TTL`; expiry means
  re-pair (credential refresh is a follow-up).
- `RunnerRegistration` stays PR1-shaped; PR3 (cross-machine liveness /
  protocolVersion / capabilities) and PR8 (distribution) remain independent.

## Verification

E2E: issue code → exchange → externally-launched runner starts from the stored
credential, connects via the callout (`decision=grant class=runner:<id>`),
registers + heartbeats; reused/expired code rejected; secret file `0600`; PR1
cross-runner isolation test still green (paired runners share the scope). See
`docs/stories/personal-runners/PR2-runner-identity-pairing/validation.md`.

## Deferred (consistent with PR1's PR2-gates, now this epic's follow-ups)

- `ownerId` / owner grouping + per-user routing (PR5).
- Authenticating the pairing endpoints (needs a user-identity initiative).
- Credential refresh/rotation (vs. long TTL + re-pair).
- EventStore-persisted codes; structured pairing audit sink.

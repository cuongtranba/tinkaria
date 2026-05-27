# Overview — PR2 Runner Identity & Pairing

Part of the **Personal Runners** initiative (`../change-request.md`), epic PR2.
Stacks on **PR1** (auth-callout isolation; `feat/personal-runners-pr1-nats-isolation`).

## Scope decision (confirmed with the human, 2026-05-26)

The app is **single-tenant — there is no user-identity system** (no `TinkariaUser`,
no login/session; the only identity primitive is machine name). The concept's
"bind a runner to their TinkariaUser" therefore cannot be implemented as written.

**Decision: build the pairing mechanism, defer `ownerId`.** A paired runner is
"a known external runner" — no owner concept yet. `RunnerRegistration` is **not**
extended with `ownerId`. Owner grouping (and the routing it feeds, PR5) waits for
a real user-identity initiative. See `docs/decisions/0008-runner-identity-pairing.md`.

## Current Behavior

- Runners are **server-spawned only**: `runner-manager` does `Bun.spawn` of
  `src/runner/runner.ts` with `NATS_URL` / `NATS_TOKEN` / `RUNNER_ID` in env.
  PR1 mints the spawned runner's scoped callout token at spawn.
- The `RUNNER_MODE=discover` seam exists (adopt an existing runner from the KV
  registry) but nothing externally-launched can obtain a credential — there is
  no way for a member to bring their own runner.
- No pairing endpoints; no runner-side credential store.

## Target Behavior

- A member clicks **"Add my runner"** → the server issues a **one-time pairing
  code** (short-lived).
- The member runs the runner on their machine and redeems the code **once** →
  receives a **durable runner credential** (a PR1-format `{c:"runner", r:runnerId}`
  token, long TTL) + `runnerId` + the NATS URL, which the runner stores locally
  (`~/.tinkaria/runner-secret.json`, `0600`).
- The **externally-launched** runner starts from its stored credential, connects
  to NATS presenting it — the **PR1 callout verifies it statelessly** and scopes
  it to `{class:runner, runnerId}` — registers in the KV registry
  (`RUNNER_MODE=discover`) and heartbeats. The server discovers it.
- **Multiple paired runners** are supported — each pairing allocates its own
  `runnerId` + credential.

## Affected Users

- **Devs/QA** — can bring their own runner instead of relying on the server to
  spawn one (the foundational step toward "your own Claude account / machine").
- **Operators** — no new infra; reuses PR1's callout + KV registry.

## Affected Product Docs

- `docs/stories/personal-runners/change-request.md` (initiative)
- `docs/decisions/0008-runner-identity-pairing.md`
- `docs/decisions/0007-...` (PR1 — the callout/token this reuses)

## Non-Goals

- **`ownerId` / owner grouping** — deferred (this story's central scope cut).
- **User accounts / authenticating the pairing endpoints** — no user system
  exists; the endpoints are public (same posture as PR1's `/auth/token`), the
  code is the bearer secret. A real auth initiative is separate.
- **Runner distribution / `bunx @tinkaria/runner` packaging** — PR8.
- **Cross-machine liveness, `protocolVersion`, capabilities** — PR3.
- **Session routing / runner picker** — PR5.
- **Credential refresh/rotation** — long TTL + re-pair for the pilot; refresh is
  a follow-up.

# Design — PR2 Runner Identity & Pairing

## Domain Model

- **Pairing code** — a short, single-use, short-TTL string a human can copy from
  the UI to the runner machine. It is a *bearer* that redeems to a credential, so
  it must be unguessable enough for its TTL + single-use window.
- **Durable runner credential** — the secret the runner persists and presents at
  every NATS connect. **It is a PR1 credential token** (`{c:"runner", r:runnerId,
  iat, exp}` HMAC-signed with the server's callout `tokenSecret`), minted with a
  **long TTL** (`RUNNER_PAIR_TTL`, default 90d). Because PR1's callout verifies it
  statelessly, the server stores **no** per-runner secret — the token is the
  source of truth.
- **runnerId** — allocated by the server at code-issue time (e.g.
  `runner-<rand>`), embedded in the credential and used as the registry key /
  NATS subject scope (exactly as a spawned runner).

No `ownerId`. No new persistent entity beyond the transient code store.

## Application Flow

**Issue (member clicks "Add my runner"):**
1. UI → `POST /api/pairing/code`.
2. Server allocates `runnerId`, mints `token = mintCredentialToken({class:"runner",
   runnerId}, tokenSecret, RUNNER_PAIR_TTL)`, generates a random `code`, stores
   `code → { runnerId, token, expiresAt }` (TTL ~10 min, single-use), returns
   `{ code, expiresAt }`.
3. UI shows the code + the one-liner to run on the runner machine.

**Exchange (runner redeems, once):**
1. Runner → `POST /api/pairing/exchange { code }`.
2. Server looks up the code; if missing/expired/already-consumed → `400/410`.
   Otherwise **atomically consume** it and return `{ runnerId, token, natsUrl,
   natsWsUrl }`.
3. Runner writes `~/.tinkaria/runner-secret.json` (`0600`):
   `{ runnerId, token, natsUrl, natsWsUrl, pairedAt }`.

**Start (externally-launched runner):**
1. Runner loads `~/.tinkaria/runner-secret.json`.
2. Connects to NATS presenting `token` as `auth_token` → PR1 callout verifies →
   scopes to `{class:"runner", runnerId}`.
3. Registers itself in `runtime_runner_registry` (`RUNNER_MODE=discover`
   self-registration) and heartbeats. Server discovers it.

## Interface Contract

- **`POST /api/pairing/code`** → `200 { code: string, expiresAt: number }`.
  Public (no user system), same posture as `/auth/token`. Requires callout mode
  (the minted token is a callout credential); in token mode → `409` with a clear
  message (pairing requires `NATS_AUTH_MODE=callout`).
- **`POST /api/pairing/exchange`** `{ code }` →
  `200 { runnerId, token, natsUrl, natsWsUrl }` | `410` expired/consumed |
  `400` unknown/malformed. Single-use: a second exchange of the same code → `410`.
- **Runner credential file** `~/.tinkaria/runner-secret.json` (`0600`):
  `{ runnerId, token, natsUrl, natsWsUrl, pairedAt }`. Path overridable via env
  (`TINKARIA_RUNNER_HOME`).
- **Runner start** — a path that loads the file and connects (vs. today's env
  from spawn). `runner.ts` already resolves `NATS_TOKEN` from env/file; extend the
  resolution to the credential file when present (env still wins for spawned).
- **Errors** — bad code → 4xx; expired durable token at connect → NATS auth
  rejection (member must re-pair; refresh is a follow-up).

## Data Model

- **Code store**: in-memory `Map<code, { runnerId, token, expiresAt, consumed }>`
  with a sweep on access (pilot). Lost on server restart → the member re-issues
  (10-min window; acceptable). EventStore persistence noted as hardening, not
  built.
- **No durable server-side secret store** — the credential token is
  self-verifying via the PR1 callout `tokenSecret`. (If `tokenSecret` rotates, all
  paired runners must re-pair — same property as PR1; documented.)
- `RunnerRegistration` **unchanged** (no `ownerId`).

## UI / Platform Impact

- **Browser** — an "Add my runner" control that calls `POST /api/pairing/code`
  and displays the code + run instructions. Minimal; no per-user state.
- **Runner machine** — a new local file under `~/.tinkaria/`. The runner is now
  launchable by the member (the invocation ergonomics / packaging is PR8; PR2
  proves it works via the existing `bun run src/runner/runner.ts` entry reading
  the stored credential).
- **Deployment** — pairing requires callout mode; on a tailnet the exchange
  returns the advertised `natsWsUrl` (PR1 Stage C).

## Observability

- Audit each pairing: code issued (runnerId, expiresAt), exchange
  success/failure (reason), and the subsequent callout `decision=grant
  class=runner:runnerId` (already logged by PR1). Never log the token or code in
  full.
- Surface paired runners via the existing registry/`/health` runner signal.

## Alternatives Considered

1. **Durable secret separate from the connect credential** (runner holds a
   long-lived secret, exchanges it for short-lived connect tokens à la
   `/auth/token`). Cleaner rotation story, but more moving parts and a new
   server-side secret store. Rejected for the pilot in favor of reusing PR1's
   stateless token directly; revisit with credential-refresh (follow-up).
2. **Persist codes/secrets in EventStore.** More restart-durable; unnecessary for
   a 10-min code window. Deferred.
3. **Add `ownerId` now (opaque label).** The richer option offered to the human;
   they chose to defer owner grouping entirely. Kept the credential payload at
   PR1's `{c,r}` shape so adding `o:ownerId` later is non-breaking.
4. **Mint the token at exchange time (not issue time).** Equivalent; minting at
   issue keeps the code→credential mapping atomic and lets the code store hold the
   finished token. Either is fine; issue-time chosen for atomicity.

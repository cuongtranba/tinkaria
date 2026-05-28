# Design — PR1 Secure NATS Transport & Isolation

## Domain Model

**Connection class** — the kind of NATS client, which determines its subject
permissions. PR1 defines three:

| Class | Used by | Allowed (publish/subscribe) |
| --- | --- | --- |
| `server-admin` | Bun orchestrator (`NatsConnector`) | All `runtime.>` subjects + JetStream + all KV buckets (broad). |
| `ui-client` | Browser WS clients | **sub** `runtime.runner.evt.>`, `runtime.evt.>`, `runtime.snap.>`; **pub** UI command subjects `runtime.cmd.>`. No runner-cmd, no registry write. |
| `runner` (bound to one `runnerId`) | Runner process | **sub** `runtime.runner.cmd.{runnerId}.>`; **pub** `runtime.runner.heartbeat.{runnerId}`, `runtime.runner.evt.>`; **KV** write only its own key in `runtime_runner_registry`. Nothing scoped to another `runnerId`. |

**Scoped credential** — the secret a connection presents to the callout. PR1:
`server-admin` and `ui-client` creds are minted server-side per process/session;
the `runner` cred for the *server-spawned* runner is minted by `runner-manager`
at spawn, carrying the `runnerId`. (PR2 replaces this with the paired
per-user secret; the subject policy above is unchanged.)

## Application Flow

**Auth-callout handshake (new):**

1. A client connects to NATS presenting a credential (token/user JWT).
2. NATS delegates authorization to the **callout responder** (the Bun server)
   over a reserved subject.
3. The responder validates the credential, resolves the connection **class**
   (and `runnerId` for runner class), and returns a **scoped user JWT** whose
   permissions are the row above.
4. NATS enforces the JWT for the life of the connection — app code never gates
   subjects.

**Connection migration (each replaces a shared-token connect):**

- `server.ts` → mint `server-admin` cred → `NatsConnector.connect` uses it.
- `GET /auth/token` → returns a **`ui-client`** credential (not the raw shared
  token). Response shape gains a credential field; `natsWsUrl` unchanged.
- `runner-manager` spawn → mint `runner` cred for the known `runnerId`, pass via
  env (replacing `NATS_TOKEN`); `connectRunner` uses it.

## Interface Contract

- **NATS server config** — auth-callout enabled (Path A: via embedded wrapper
  config if supported; Path B: external `nats-server` conf with
  `authorization { auth_callout { issuer, auth_users, account } }`). Bind host =
  tailnet interface; `NATS_ADVERTISED_HOST` set so the WS URL is reachable.
- **Callout responder** — internal NATS service subject (e.g.
  `$SYS.REQ.USER.AUTH`), request = NATS auth request, response = signed user JWT
  or rejection. Rejection → connection refused (client sees auth error).
- **`GET /auth/token`** (changed) — returns `{ creds | token, natsWsUrl? }` where
  the credential is a `ui-client` credential, **not** the shared admin token.
  This is a client-visible contract change (the browser `nats-socket.ts` consumes
  it).
- **Runner spawn env** (changed) — `NATS_TOKEN` (shared) → a scoped runner
  credential. Internal to `runner-manager` ↔ `runner`.
- **Errors** — invalid/expired credential → NATS auth rejection; runner-class
  creds used on a foreign `runnerId` subject → **permissions violation** (the
  property the negative test asserts).

## Data Model

- No application tables. **Signing keys** for the callout (the seed/nkey that
  signs issued user JWTs) become a new secret the server holds — stored where the
  existing `nats.token` lives (`NATS_DATA_DIR`), same on-disk trust boundary, not
  in git. Document key rotation as a follow-up.
- KV bucket `runtime_runner_registry` unchanged in shape (PR3 owns its fields);
  PR1 only constrains *who may write which key*.

## UI / Platform Impact

- **Browser** — transparent if `nats-socket.ts` is updated to consume the new
  credential field; the direct-WS vs `/nats-ws` proxy fallback still applies.
- **Deployment** — operators must bind NATS to the tailnet and, if Path B, run
  an external `nats-server` (the `NATS_MODE=external` seam already exists). The
  WireGuard tunnel supplies confidentiality, so WS `no_tls` may remain **within
  the tailnet** — called out as an explicit, documented trust assumption.
- **CLI / desktop** — none in PR1.

## Tailnet Deployment

To expose NATS over the tailnet so off-box clients (browsers, future paired
runners) can connect:

| Env var | Purpose | Example |
| --- | --- | --- |
| `NATS_HOST` | Interface to bind (tailnet IP or `0.0.0.0`). Default `127.0.0.1`. | `100.64.1.1` |
| `NATS_ADVERTISED_HOST` | Host included in `natsWsUrl` returned by `/auth/token`. Set to the tailnet IP reachable by browsers. | `100.64.1.1` |
| `NATS_AUTH_MODE` | Must be `callout` when `NATS_HOST` is non-loopback (enforced by the startup guard). | `callout` |

CLI equivalent: `--remote` sets `NATS_HOST=0.0.0.0` (shortcut for `--host 0.0.0.0`).

**Guard (decision 0007):** startup refuses to bind a non-loopback host in token
mode — a shared-token bus must not be exposed beyond loopback. The guard
predicate is `requiresCalloutForBind(host, authMode)` in
`src/server/nats-bind-guard.ts`. Loopback + token is always allowed (dev
default). Non-loopback + callout is the tailnet path; the server logs a one-line
note about the WireGuard trust assumption.

**Off-box runner URL (PR2):** PR1 runners are server-spawned and connect locally.
Off-box runners getting a reachable `NATS_URL` via env is a PR2 concern; PR1
Stage C covers the bind, the browser/WS advertise URL, and the guard only.

## Observability

- Audit every callout decision: timestamp, presented identity, resolved class,
  `runnerId`, granted/denied. This is the security audit trail the high-risk lane
  requires (and what makes a future external-team path defensible).
- Add the callout responder to `/health` (it is now on the critical connect
  path — if it's down, *no* client can authenticate).
- Metric/log: rejected connections and permissions violations (should be ~0 in
  normal operation; a spike means misconfigured scope).

## Alternatives Considered

1. **Keep the shared token, just bind the tailnet.** Rejected — exposes a bus
   where any holder can drive any runner; defeats the entire isolation goal and
   blocks the external-team path. The concept explicitly calls for NATS-native
   isolation, not app-level checks.
2. **App-level subject authorization (gateway in the Bun server).** Rejected —
   the runner connects to NATS directly, not through the Bun server; an
   app-level check can't constrain a direct NATS client. NATS must enforce.
3. **Per-account static NATS users (no callout).** Viable for fixed classes but
   can't scope per-`runnerId` dynamically (runnerIds are created at runtime) and
   doesn't extend to PR2's per-user paired creds. Callout is the seam that
   serves both. Kept as a fallback if the spike kills callout on both paths.
4. **Path A vs Path B (embedded vs external `nats-server`)** — the open fork;
   decided by the spike (Phase 1). Recommendation: prefer A to keep single-binary
   ops; accept B (external `nats-server`) if the embedded wrapper can't express
   auth-callout, since the `NATS_MODE=external` seam already exists.

# Overview — PR3 Cross-machine Registration & Liveness + Versioning

Part of **Personal Runners** (`../change-request.md`), epic PR3 (concept
decisions #7 liveness, #9 versioning). Stacks on **PR2**
(`feat/personal-runners-pr2-pairing`).

## Current Behavior

- `RunnerRegistration` = `{ runnerId, pid, startedAt, providers }` — no version,
  no liveness metadata. `providers` is a hardcoded `["claude","codex"]`.
- Runner liveness is a **30s boolean** (`heartbeatFresh = now - lastHeartbeatAt
  <= 30_000`) for the active runner; the **discover path** (picking a runner from
  the KV registry) uses **`process.kill(reg.pid, 0)`** — which is meaningless
  across machines (a paired runner's pid is on another host).
- There is **no protocol versioning** between runner and server, and **no gate**
  at turn start — a stale/incompatible runner would be dispatched to and fail
  opaquely at turn time.
- `/health` `runner` reports `{ ok, runnerId, pid, registered, heartbeatFresh,
  lastHeartbeatAt }` — boolean only, no state.

## Target Behavior

- `RunnerRegistration` gains **`protocolVersion`** and a server-tracked
  **`lastHeartbeatAt`**; `pid` stays as *informational only* (no longer used for
  cross-machine liveness). A `capabilities` field is added to the shape (populated
  minimally now; rich probing is PR4).
- **Heartbeat-TTL liveness states**, uniform for spawned and paired runners:
  **online** (`age < 25s`), **degraded** (`25s ≤ age < 60s`, ~2 missed beats),
  **offline** (`age ≥ 60s`). The discover path uses heartbeat age, not `pid`.
- **Protocol-version handshake**: a `PROTOCOL_VERSION` constant; the runner
  reports its version; the server marks a runner outside the supported range
  **`incompatible`** (a distinct state, *not* "offline") and **blocks turn start**
  with a clear message ("runner is incompatible — run `tinkaria-runner upgrade`"),
  never a silent failure/downgrade.
- `/health` `runner` gains `state` + `protocolVersion` + `incompatible`.

## Affected Users

- **Devs/QA** — clearer feedback when a (paired or spawned) runner is degraded,
  offline, or version-incompatible, instead of an opaque turn failure.
- **Operators** — cross-machine liveness actually works (paired runners on other
  hosts are correctly shown live/dead).

## Affected Product Docs

- `docs/decisions/0009-registration-liveness-versioning.md`
- `docs/decisions/0007` (PR1 callout), `0008` (PR2 pairing) — context.

## Non-Goals (explicit deferrals)

- **Suspend-session / resume-from-branch / "needs attention after 30 min"**
  (concept #7) — depends on the **git-native session model (PR6/PR7)** that does
  not exist yet. PR3 delivers liveness **detection + states**; the session
  *reactions* are deferred.
- **Rich capability probing** (real installed models/versions) + the **command
  profile split** — **PR4**. PR3 only adds the `capabilities` field shape.
- **Multi-runner routing / picker** — **PR5**. PR3 keeps single-active-runner
  routing; it only makes the registry's liveness correct when several runners
  exist.
- **`ownerId`** — still deferred (no user-identity system; PR2 decision 0008).
- **Auto-update** — rejected by the concept; the runner is marked incompatible
  and the operator upgrades manually.

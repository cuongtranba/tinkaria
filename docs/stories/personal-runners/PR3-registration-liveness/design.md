# Design — PR3 Registration & Liveness + Versioning

## Domain Model

**Runner liveness state** — derived, never stored:

| State | Condition (`age = now - lastHeartbeatAt`) | Meaning |
| --- | --- | --- |
| `online` | `age < 25_000` | heartbeating normally |
| `degraded` | `25_000 ≤ age < 60_000` | ~2 missed beats (GC/wifi blip) — don't flap |
| `offline` | `age ≥ 60_000` (or never heartbeated) | gone |
| `incompatible` | `protocolVersion` outside supported range | distinct from offline; blocks start |

`incompatible` takes precedence in display (a version-skewed runner that is also
heartbeating is still unusable). Heartbeat interval stays 10s; thresholds 25s/60s
give 2-missed / 6-missed.

**`RunnerRegistration` (extended, additive):**
```
{ runnerId, pid, startedAt, providers,
  protocolVersion: number,           // NEW — reported by the runner
  capabilities?: RunnerCapabilities } // NEW — shape only; { providers, ... } (rich probe = PR4)
```
`lastHeartbeatAt` is **server-side** state (already tracked from the heartbeat
stream), not written by the runner into the registry.

## Application Flow

- **Registration (runner):** runner writes `protocolVersion: PROTOCOL_VERSION`
  into its registration (runner-nats `register()`).
- **Liveness (server):** `runnerLivenessState(lastHeartbeatAt, now)` →
  pure function returning the state. Used by `/health`, by the discover path
  (replace `process.kill(pid,0)` → treat `offline` as dead), and anywhere
  readiness is judged.
- **Versioning (server):** on reading a registration, compute
  `incompatible = !isProtocolSupported(reg.protocolVersion)`. `SUPPORTED_RANGE`
  is a `{ min, max }` (today `min=max=PROTOCOL_VERSION`).
- **Turn-start gate:** before `RunnerProxy.sendCommand("start_turn", …)`, if the
  resolved runner is `incompatible` → throw/return a clear error (surfaced to the
  client) — do **not** dispatch. If `offline` → the existing fail-fast applies.

## Interface Contract

- **`RunnerRegistration`** — additive fields (`protocolVersion` required going
  forward; `capabilities?` optional). Internal NATS/KV protocol. Old entries
  without `protocolVersion` → treated as `incompatible` (defensive; KV entries are
  re-registered on runner restart so this self-heals).
- **`PROTOCOL_VERSION`** (shared constant, `runner-protocol.ts`) + `SUPPORTED_RANGE`
  + `isProtocolSupported(v)` + `runnerLivenessState(lastHeartbeatAt, now)` +
  `RunnerLivenessState` type — all in shared so client/server/runner agree.
- **Turn start** — incompatible runner → error
  `"Runner <id> is incompatible (protocol v<runner>, server supports v<min>–<max>) — run tinkaria-runner upgrade"`; client-visible.
- **`/health` `runner`** — add `state: RunnerLivenessState`, `protocolVersion:
  number | null`, `incompatible: boolean`. `heartbeatFresh` kept (== `state ===
  "online"`) for back-compat of existing consumers.

## Data Model

- No tables. KV `runtime_runner_registry` entries gain `protocolVersion`,
  `capabilities`, and **`lastSeenAt`** (additive JSON). No migration — entries are
  ephemeral (re-written each runner start; a missing field → incompatible/offline,
  self-healing).
- **Two freshness sources, one pure function:**
  - *Active runner* (the one this server is subscribed to): liveness uses the
    **server-tracked `lastHeartbeatAt`** (from the 10s heartbeat stream) — most
    real-time, no extra writes. Used by `/health`.
  - *Discovery* (judging a runner the server is **not** subscribed to — e.g. a
    paired runner on another host, picked from the KV registry): `process.kill`
    is meaningless, and the server has no heartbeat history, so the registry entry
    must carry its own freshness. The runner updates **`lastSeenAt`** in its own
    KV entry on a bounded cadence (piggybacked on the heartbeat / coarser timer;
    it may write its own key per PR1 scope). The discover path uses
    `runnerLivenessState(reg.lastSeenAt, now)`.

## UI / Platform Impact

- **Browser** — `/health`/`RunnersTab` can show the new `state`/`incompatible`
  (minimal surfacing; rich runner-state UI is polish, not required by PR3).
- **Platform** — cross-machine liveness now correct (no pid dependence for paired
  runners). The `incompatible` message guides the operator to upgrade.

## Observability

- Log a runner's state transitions (online→degraded→offline) and any
  `incompatible` detection (runnerId, reported version, supported range). These
  are the signals an operator needs; never noisy on steady state.
- Turn-start blocks (incompatible/offline) logged with the reason.

## Alternatives Considered

1. **Keep `pid`-based liveness, add a special case for paired runners.** Rejected —
   two liveness mechanisms is fragile; heartbeat-TTL is uniform and is what the
   concept specifies. `pid` kept only as informational.
2. **Store the active runner's `lastHeartbeatAt` in KV (per-beat write).** Rejected
   for the *active* runner — the server already owns the heartbeat stream, so
   server-side tracking is more real-time and avoids a 10s write. **But discovery
   of a non-subscribed runner genuinely needs a KV freshness field** — hence the
   coarse `lastSeenAt` above (bounded cadence, not necessarily per-beat). The two
   uses share the one `runnerLivenessState` function.
3. **Silently accept any protocolVersion (log only).** Rejected — the concept is
   explicit: never silently degrade; a stale runner must be *loudly* incompatible
   and blocked, because "mostly works but mangles one field" is the worst failure.
4. **Build the suspend/resume reaction now.** Rejected — requires the git-native
   session model (PR6/PR7). PR3 stops at detection + states.

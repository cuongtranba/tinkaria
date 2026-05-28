# Overview — PR5 Session Routing

Part of **Personal Runners** (`../change-request.md`), epic PR5 (concept decision
#3). Stacks on **PR3** (registration/liveness) and **PR4** (capabilities). The
piece that turns "one runner" into "route each session to the right runner."

## Lane deviation (normal → high-risk)

The change-request pre-triaged PR5 as **normal**. We lane it up to **high-risk**:
the realized work rewires the single most critical execution flow — turn dispatch
via `RunnerProxy` — from a fixed single `runnerId` to per-session runner
*selection*. That is a large **Existing-behavior** blast radius spanning **server
+ client + shared protocol** (**Multi-domain**). No hard gate is triggered (no
Auth/Authorization/Data-loss/Audit/External-provider/weakening-validation), so the
lane is a judgment call; when pre-triage and realized blast radius disagree, we
lane up — matching the care applied to PR1–PR4. Recorded in decision 0011.

## Current Behavior (reconciled stack, post-PR4)

- **One runner, baked in.** `server.ts` constructs a single `RunnerManager`
  (`ensureRunner()` spawns or discovers exactly one runner) and a single
  `RunnerProxy` with that one `runnerId`. Every `start_turn`/`cancel_turn`/
  `respond_tool`/`stop_chat_pty` goes to `runnerCmdSubject(this.runnerId, cmd)` —
  there is no per-session choice.
- **`/health` reports one `runner`** (`runnerManager.getReadiness()`): state,
  protocolVersion, incompatible, capabilities.
- **The KV registry already holds *all* runners** (`RUNNER_REGISTRY_BUCKET`).
  `RunnerManager.discoverExternalRunner()` already iterates every key, derives
  liveness from `lastSeenAt`, and skips offline/incompatible — but it stops at the
  *first* eligible runner and never exposes the full set.
- **The turn-start gate is per-the-single-runner**: `RunnerProxy.sendCommand`
  consults `getRunnerReadiness()` → `runnerManager.getReadiness()` (one runner),
  enforcing protocol-compat + capability fail-closed.

## Target Behavior

- **Enumerate all runners.** A `RunnerRouter` reads the whole KV registry into
  `RunnerDescriptor[]`, each annotated with PR3 liveness (online/degraded/offline)
  + PR4 capabilities + protocol compatibility.
- **Route each session.** Selection policy, capability + liveness aware:
  1. **Sticky default** — if the chat has a persisted `runnerId` that is online,
     compatible, and capable of the requested provider → use it (**zero clicks**).
  2. **Sole eligible** — exactly one eligible runner and no sticky conflict →
     auto-select (**zero clicks**).
  3. **Needs pick** — sticky runner offline OR ≥2 eligible runners → surface a
     **picker**; the chosen runnerId is persisted as the new sticky default.
  4. **Fail-fast** — zero eligible runners → a clear, actionable error
     ("no online runner for <provider> — pair or start one"), never a silent hang.
- **Shared-runner fallback.** The server-spawned runner (the "team API key" /
  shared runner) is always an eligible candidate, so a member with no personal
  runner still routes somewhere.
- **Sticky pin persisted.** `chat.runnerId` on the chat record; set on first
  selection or explicit pick. Recompute only when the sticky runner is no longer
  eligible.
- **`/health` surfaces the fleet** — `runners: RunnerDescriptor[]` alongside the
  existing primary `runner` (back-compat).

## Affected Users

- **Devs/QA with their own paired runner** — sessions land on *their* machine by
  default with no extra clicks; a clear picker only when it's genuinely ambiguous.
- **Members with no personal runner** — fall back to the shared runner instead of
  failing.
- **Operators** — `/health` shows the whole fleet, not just the local runner.

## Affected Product Docs

- `docs/decisions/0011-session-routing.md` (new)
- `docs/decisions/0007/0008/0009/0010` (PR1–PR4) — context.

## Non-Goals (deferred)

- **`ownerId` / per-user runner ownership** — still deferred (no user-identity
  system; deferred since PR2). PR5 routes among **all** registered runners, not
  per-user. When identity lands, selection filters by `ownerId` — the
  `RunnerDescriptor.ownerId` field is already carried, just not yet enforced.
- **Model-level capability gate** — PR4 gates by *provider*; routing by specific
  model (e.g. only-runner-with-opus) is a follow-up. PR5 selects on provider +
  liveness; model mismatch still fails at turn time as today.
- **Load balancing / least-busy selection** — PR5 is sticky-default + pick, not a
  scheduler. Spreading turns across equally-eligible runners is a later concern.
- **Git-native workspace / draft-PR** — PR6/PR7.

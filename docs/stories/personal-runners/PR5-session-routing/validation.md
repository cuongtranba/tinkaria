# Validation — PR5 Session Routing

Status legend: ☐ planned · ◐ in progress · ☑ proven.

## Unit (RunnerRouter — `runner-router.test.ts`)

- ☐ **Sticky hit → zero-click**: chat with `runnerId=R1`, R1 online+compatible+capable → `{ selected, R1, sticky:true }`.
- ☐ **Sole eligible → zero-click**: one online+capable runner, no sticky → `{ selected, R, sticky:false }`.
- ☐ **Ambiguous → needs_pick**: ≥2 eligible, no sticky → `{ needs_pick, candidates:[...], reason:"ambiguous" }`.
- ☐ **Sticky offline → needs_pick**: chat `runnerId=R1`, R1 offline, R2 online → `{ needs_pick, reason:"sticky_offline" }`.
- ☐ **None eligible → fail-fast**: all offline/incompatible → `{ unavailable, reason includes provider }`.
- ☐ **Offline excluded** (liveness fail-closed) and **incompatible excluded** (protocol fail-closed).
- ☐ **pre-PR4 `capabilities===null` treated capable** (capability fail-open).
- ☐ **Shared-runner fallback**: only the `isShared` runner eligible → auto-selected.
- ☐ **`list()` annotates** state + capabilities + incompatible + isShared for every KV entry.

## Integration (RunnerProxy routing — `runner-routing.test.ts`)

- ☐ **First turn pins**: send on a chat with no `runnerId` → `store.setChatRunner` called with the selected runner.
- ☐ **Sticky reused**: second turn on the same chat dispatches to the pinned runner without re-selecting.
- ☐ **Cancel/respond_tool/stop_chat_pty hit the pinned runner** (not re-routed mid-session).
- ☐ **needs_pick → `RunnerPickRequired`** thrown (carries candidates), no NATS dispatch.
- ☐ **unavailable → fail-fast Error**, no NATS dispatch.
- ☐ **Per-runner capability gate**: selected runner lacking the provider → refused with clear message (not silent).
- ☐ **Superset proof**: existing `runner-proxy.test.ts` passes **unchanged** (single eligible runner ⇒ identical single-runner behavior).

## E2E / Platform (dual-signal, dedicated port — NOT 3210)

- ☐ **One runner → no picker**: boot `PORT=3399`; `/health` shared runner `ok` + `runners[]` has 1; `browser-harness` send a turn → lands, picker never shown. Screenshot + server/runner stdout.
- ☐ **Two runners → picker → route**: register a 2nd runner in KV; send → `chat.runnerPickRequired`; pick → turn lands on the chosen runner (verify via runner stdout). Screenshot.
- ☐ **Sticky offline → re-pick**: kill the pinned runner; next turn surfaces the picker again. Screenshot.
- ☐ **`/health` fleet**: `curl /health` shows `runners[]` with per-runner state/capabilities.

## Dual-signal rule

Browser/UI signal and server-side signal (`/health` + server/runner stdout) must
**agree**. A picker shown in the UI must correspond to ≥2 eligible (or sticky
offline) in `/health`; a landed turn must show the start_turn reaching the chosen
runnerId in that runner's stdout. Disagreement = the bug.

## Compensating control note

GitNexus impact analysis was **unavailable** (index read-only the whole session).
Per PR1–PR4 precedent, the compensating control is: existing turn-path test suite
green unchanged (superset proof) + new unit/integration tests + dual-signal boot +
typescript-reviewer & security review of the routing decision surface.

## Results

### Static gates (all stages)
- **typecheck** `bunx @typescript/native-preview --noEmit -p tsconfig.json` → **0 errors** at each stage.
- **Stage 1** `runner-router.test.ts` → **41 pass / 0 fail**.
- **Stage 2** `runner-routing.test.ts` → **10 pass / 0 fail**; existing `runner-proxy.test.ts` **16 pass UNCHANGED** (superset proof — `git diff --stat` empty); full `src/server` **19 fail (pre-existing baseline, verified by stash)** — zero regressions.
- **Stage 3** `nats-responders.test.ts` → **51 pass / 0 fail** (incl. 4 new: selectRunner, needsPick mapping ×2, fail-fast); full `src/server` still **19 pre-existing fail only**.
- Commits: packet `447d26f`; Stage 1 `7f1ecc6`; Stage 2 `faa1732`; Stage 3 `f34809f`.

### E2E / Platform — dual-signal boot (DEV profile, port 3399 — NOT 3210)
Booted the worktree on the isolated **DEV** profile (`TINKARIA_RUNTIME_PROFILE=dev`,
`~/.tinkaria-dev/data`, NATS ephemeral 50170/50169) while the user's live PROD
instance kept running on :3210 — **zero collision, confirmed :3210 LIVE-OK after
shutdown**.

**Server signal — `/health` on :3399:**
- `ok:true, status:"ok"`, `natsDaemon.ok`, `natsConnection.ok`.
- shared `runner`: `{ok:true, state:"online", protocolVersion:1, incompatible:false, capabilities.providers:["claude","codex"]}`.
- ☑ **`runners[]` field present** (the new fleet surface).
- `runners_count: 213` — see finding below.

**Server signal — boot stdout:** runner `runner-1779859936444-40033` connected,
`Probed capabilities: providers=[claude, codex]`, ready; `Operational health
initialized — status: ok`; `data dir: ~/.tinkaria-dev/data`.

**Routing correctness (the proof):** of 213 registry entries, **exactly 1
non-offline** → **1 eligible-for-claude**: the shared runner (online, compatible,
capable, `isShared:true`). `select({provider:"claude"})` therefore hits the
**sole-eligible → auto-select (zero-click)** branch → routes to the shared runner,
**no picker**. The 212 stale entries are correctly excluded by fail-closed
liveness + compat. Server log + `/health` + real-NATS registry enumeration all
**agree** (dual-signal satisfied for the routing engine).

- ☑ `RunnerRouter.list()` enumerates the real KV registry, annotated (state/caps/incompatible/isShared).
- ☑ Sole eligible runner auto-selected (zero clicks) against a real registry.
- ☑ Shared-runner fallback: the server-spawned `isShared` runner is the sole eligible → auto-selected.
- ☑ `/health` surfaces `runners[]`; `ok` still gated on the shared runner.
- **Not exercised live (logic unit-tested):** the **picker path** (`needs_pick`)
  needs ≥2 eligible runners — not stageable with one real runner; covered by
  `runner-router.test.ts` (ambiguous/sticky-offline) + `runner-routing.test.ts`
  (RunnerPickRequired) + `nats-responders.test.ts` (needsPick mapping) + the
  client `RunnerPickerDialog` component. Browser-driven multi-runner picker is a
  follow-up once a second real runner can be paired (PR8 distribution).

### Finding (logged as friction → HARNESS_BACKLOG)
The `runtime_runner_registry` KV bucket has **no TTL / offline purge** — every
spawned runner that exits leaves a tombstone (213 accumulated across past DEV
boots). **Pre-existing** (PR3 registration added no TTL), not caused by PR5;
`select()` filters them correctly so routing is unaffected. But PR5's `list()`
exposes them → `/health` payload bloat (~35KB) and unbounded registry growth.
Backlog: KV TTL or purge-offline-on-list / cap. See `docs/HARNESS_BACKLOG.md`.

### Compensating control
GitNexus impact analysis remained **unavailable** (index read-only the whole
session). Compensating controls applied: superset proof (existing turn-path suite
green unchanged) + new unit/integration tests + the real-NATS dual-signal boot
above + code review. Per PR1–PR4 precedent.

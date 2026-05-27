# Exec Plan — PR5 Session Routing

Staged like PR4 so each stage is independently green (typecheck + tests) and
reviewable. `bunx @typescript/native-preview --noEmit -p tsconfig.json` after every
stage; dual-signal boot on a **dedicated port (NOT 3210)** at the end.

## Stage 1 — `RunnerRouter` (enumerate + select)  [no behavior change]

1. Add `RunnerDescriptor` + `RunnerSelection` types (reuse PR3 liveness + PR4
   capabilities from `shared/runner-protocol`).
2. `src/server/runner-router.ts`: `list()` reads `RUNNER_REGISTRY_BUCKET` and
   annotates each entry (extract the KV-iteration from
   `RunnerManager.discoverExternalRunner`, leaving that method working); `select()`
   implements the deterministic policy from design.md; `isShared` from
   `sharedRunnerId()`.
3. **Tests** `runner-router.test.ts`: sticky-hit (zero-click), sole-eligible
   (zero-click), ambiguous (≥2 → needs_pick), sticky-offline (→ needs_pick),
   none-eligible (→ unavailable), offline/incompatible excluded, pre-PR4
   `capabilities===null` treated capable, shared-runner-only fallback.
   → verify: `bun test runner-router.test.ts` green; typecheck 0.

## Stage 2 — `RunnerProxy` per-session dispatch + `chat.runnerId` persistence

1. `EventStore`: add optional `runnerId` to the chat record + `setChatRunner`
   (mirror `setChatProvider`). Additive; no migration.
2. `RunnerProxy`: constructor takes `router` + `sharedRunnerId` +
   `getRunnerReadiness(runnerId)`; add `resolveRunnerForChat`; thread resolved
   `runnerId` through `sendCommand`; non-start commands use the pinned
   `chat.runnerId`. Add typed `RunnerPickRequired` error.
3. `server.ts`: construct `RunnerRouter`; pass it + `runnerManager.getRunnerId` to
   `RunnerProxy`; `getRunnerReadiness` resolves per-runner via the router (shared
   runner still via `runnerManager.getReadiness()`).
4. **Tests**: existing `runner-proxy.test.ts` stays green **unchanged** (single
   eligible runner ⇒ identical behavior — the superset proof). New
   `runner-routing.test.ts`: first turn pins `chat.runnerId`; sticky reused; cancel
   /respond_tool hit the pinned runner; needs_pick throws `RunnerPickRequired`;
   unavailable fails fast; per-runner capability gate refuses an incapable selected
   runner.
   → verify: full `bun test src/server` green; typecheck 0.

## Stage 3 — surfaces (health fleet + client picker) + dual-signal verify

1. `/health`: add `runners: RunnerDescriptor[]` (`router.list()`); `runner`
   unchanged; `ok` logic unchanged.
2. WS layer: map `RunnerPickRequired` → `chat.runnerPickRequired` event; add
   `chat.selectRunner` command → `store.setChatRunner` + retry pending send.
3. Client: picker on `chat.runnerPickRequired` (online runners + machine name +
   provider capabilities); `chat.selectRunner` on choose; composer "runner: <name>"
   re-pick affordance. **Zero-click path must never render the picker.**
4. **Dual-signal verify** (CLAUDE.md): `bun run dev` on a **dedicated port** (e.g.
   `PORT=3399`, never 3210); `curl /health` → `runners[]` present, shared runner
   `ok`. Drive via `browser-harness new_tab` against that port: one-runner →
   no picker, turn lands; simulate a second registered runner in KV → picker
   appears, pick → turn lands on chosen; kill sticky runner → next turn re-picks.
   Screenshot each; capture server + runner stdout. Record in validation.md.

## Out of scope (deferred — see overview Non-Goals)

`ownerId` enforcement; model-level routing; load balancing; git-native workspace.

## Verification gates (every stage)

- `bunx @typescript/native-preview --noEmit -p tsconfig.json` → 0 errors.
- Focused `bun test` for the stage, then broader `bun test src/server` for Stage 2/3.
- `git diff --check` before finalizing.
- Stage 3: dual-signal (browser + server `/health`/stdout) must agree.
- Code review (typescript-reviewer) + security review of the routing decision
  surface before declaring done. GitNexus impact unavailable → tests + review are
  the compensating control (documented).

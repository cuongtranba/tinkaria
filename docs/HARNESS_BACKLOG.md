# Harness Backlog

Use this file when an agent discovers a missing harness capability but should
not change the operating model immediately.

## Template

```md
## Missing Harness Capability

### Title

Short name.

### Discovered While

Task or story that exposed the gap.

### Current Pain

What was hard, repeated, ambiguous, or unsafe?

### Suggested Improvement

What should be added or changed?

### Risk

Tiny, normal, or high-risk.

### Status

proposed | accepted | implemented | rejected
```

## Items

## Missing Harness Capability

### Title

c3x 8.0.7 migrate-legacy drops all entity bodies (C3 DB migration blocked)

### Discovered While

Planning `mobile-composer-menu` — the project's "Work From C3" rule routed
planning through `/c3`, which requires a built `.c3/c3.db`. None existed
(legacy v6 markdown only), so a v6→v7 migration was attempted.

### Current Pain

`c3x migrate-legacy` (v8.0.7) imports frontmatter + relationships + code-map
but **silently drops every entity body** — the `nodes` table stays empty, there
is no `body` column, and `c3x export` round-trips frontmatter-only files
(e.g. `rule-react-no-effects` 80 lines → 6). No `warning:`/`error:` line is
emitted, so the documented "warnings are errors" gate passes while authored
prose for all rules/ADRs/refs/recipes is absent from the DB. Phase B (v7→v8)
then reports `0 to migrate`. Leaving the half-migrated DB is a footgun: a later
`c3x export`/sync would overwrite the intact markdown with empty bodies.

### Suggested Improvement

Pin/obtain a c3x build whose `migrate-legacy` preserves bodies (populate
`nodes` from the markdown body), or add a body-preserving import path; until
then keep C3 file-based and treat `.c3/` markdown as the source of truth. The
broken `c3.db` was deleted; additive repairs (40 `## Dependencies` stubs, 18
stale code-map glob fixes) remain on disk and are independently valid.

### Risk

normal

### Status

proposed

## Pre-existing Test Failure

### Title

parity-matrix.test.ts red since port-claude-pty merge (SDK ↔ PTY event divergence)

### Discovered While

Verifying the `pty-runner-cpu-mem-sampling` fix — running the
`src/server/claude-pty/` suite surfaced 7 failures in
`parity-matrix.test.ts` ("SDK ↔ PTY HarnessEvent equivalence matrix").
Confirmed identical on clean `main` (HEAD c607df8); unrelated to the cpu/mem
change.

### Current Pain

`parity-matrix.test.ts` asserts the PTY JSONL parser
(`createJsonlEventParser`) and the SDK normalizer
(`createClaudeHarnessStream`) emit an identical `HarnessEvent` sequence. They
no longer do: the PTY parser intentionally emits extra `session_token` (for any
message carrying a `session_id`, tagged D3) and `context_window_updated` (from
usage deltas, tagged D1) events that the SDK path does not emit. The file
entered the repo already-red at the `port-claude-pty` merge (PR #2, c607df8) and
has never passed on `main` — a test merged broken, reflecting an intentional PTY
enrichment that was never reconciled on the SDK side or in the test contract.

### Suggested Improvement

Decide the parity contract and either (a) relax the test so SDK events are a
subsequence of PTY events (allowing the intended PTY-only enrichment, no runtime
change), or (b) bring `createClaudeHarnessStream` to parity by also emitting
`session_token` + `context_window_updated` (changes SDK provider runtime
behavior — verify downstream consumers first). Option (a) is the low-risk match
to apparent intent. Also confirm whether the SDK provider is genuinely missing
context-window / session info at runtime (real product gap) before choosing.

### Risk

normal

### Status

proposed

## Operational Finding (backlog #6)

### Title

Runner registry KV bucket has no TTL / offline-purge — tombstones accumulate unbounded

### Discovered While

PR5 (session routing) dual-signal boot on the DEV profile (:3399). `RunnerRouter.list()`
enumerated **213 entries** in `runtime_runner_registry`; only **1 was online** (the
freshly-spawned shared runner). The other 212 are stale tombstones from past runner
spawns that exited without removing their KV entry.

### Current Pain

Unbounded KV growth; `/health` `runners[]` payload bloat (~35KB for 213 entries);
`list()` slows as entries accumulate. Routing itself is **correct** — `select()` is
fail-closed on liveness + compat, so the 212 stale entries are filtered out and never
selected. Impact is observability/performance only, not correctness.

### Suggested Improvement

Add a KV TTL to `runtime_runner_registry` (e.g. a few minutes, refreshed by each
heartbeat) so dead runners expire; OR purge offline-beyond-grace entries on
`list()`/registration; optionally cap or paginate `/health` `runners[]`. Pre-existing
since PR3 (registration added no TTL); PR5 merely exposed it via enumeration.

### Risk

tiny

### Status

proposed

## Missing Harness Capability

### Title

Harness CLI binary + harness.db unavailable inside git worktrees (gitignored)

### Discovered While

Authoring the Personal Runners PR1 story packet in an isolated worktree
(`.worktrees/pr1-nats-isolation`).

### Current Pain

`scripts/bin/harness-cli` and `harness.db` are both gitignored, so a freshly
created `git worktree` has neither. Recording intake/story/decision/trace must
be run from the **main checkout** while the packet docs live on the feature
branch in the worktree — splitting one logical task across two directories.
Minor secondary gap: `harness trace --outcome` enforces a CHECK constraint
(`completed|blocked|partial|failed`) that `--help` does not list, so the first
attempt failed on an invalid value.

### Suggested Improvement

Make `scripts/harness` auto-locate the common checkout's `harness.db` via
`git rev-parse --git-common-dir` (and resolve a shared binary), OR document the
"record harness state from the main checkout" rule in `docs/HARNESS.md`. List
the valid `--outcome` values in the `trace` help text.

### Risk

tiny

### Status

proposed

---

## Missing Harness Capability

### Title

Embedded NATS daemon uses an ephemeral port — paired runner credentials go stale on server restart

### Discovered While

US-RPAH (fixing the pairing-exchange unroutable-host bug).

### Current Pain

The paired-runner credential is long-lived (90 days, `RUNNER_PAIR_TTL`), but the
`natsUrl` *port* inside it is ephemeral: `NATS_PORT` defaults to `-1`
(`src/nats/nats-daemon-callout.ts:26`), so the embedded daemon binds a random
port each boot. After any server restart the daemon picks a new port and every
paired runner's stored URL is stale, forcing a re-pair. The host fix in US-RPAH
makes pairing routable across machines, but durability across restarts is still
broken.

### Suggested Improvement

Default the embedded NATS port to a stable value, or persist + reuse the chosen
port across restarts, so a durable credential keeps working without re-pairing.

### Risk

normal

### Status

proposed

---

## Missing Harness Capability

### Title

Vite dev proxy does not forward /api/pairing/* — pairing code can't be generated through the :5174 dev client

### Discovered While

Verifying US-RLL (Runners tab live list) in the running app.

### Current Pain

`vite.config` proxy allowlist is `/health`, `/api/render/pug`, `/api/ext/`,
`/nats-ws`. `POST /api/pairing/code` through the vite client (`:5174`) returns
`404` with an empty body, while the backend (`:5175`) returns `200`. The empty
body also makes the client's `res.json()` throw "Unexpected end of JSON input".
Dev-only (production server is single-origin, so unaffected), but it blocks
dogfooding the Runners pairing flow through the vite dev client — verification
had to be done on a same-origin `bun run build` instead.

### Suggested Improvement

Add `/api/pairing/` to the vite dev proxy (or a broader `/api/` rule that
excludes client-owned routes).

### Risk

tiny

### Status

proposed

---

## Missing Harness Capability

### Title

Ship remote-runner logs to VictoriaLogs over NATS (VL is localhost-only)

### Discovered While

US-OBS-VL (VictoriaLogs observability).

### Current Pain

VictoriaLogs is bound to 127.0.0.1 only (it stores chat content + tokens). A
runner on another machine can't reach it, so the backend console tee only covers
the server and a *local* runner. The remote runner's logs — the key signal for
the remote turn-dispatch timeout this whole thread is chasing — are not captured.

### Suggested Improvement

Have the runner publish its log lines over its existing NATS connection to a
server subject (e.g. `runtime.runner.log.<runnerId>`); the server subscribes and
forwards to VictoriaLogs. Keeps VL localhost-only. Needs a `pub` allow for that
subject in `scope-policy.ts` (security-sensitive — review the scope).

### Risk

normal

### Status

proposed

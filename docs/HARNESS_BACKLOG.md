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

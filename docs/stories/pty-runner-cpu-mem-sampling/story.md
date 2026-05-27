# S-pty-runner-cpu-mem-sampling Runner PTY surfaces live CPU/mem to UI

## Status

implemented

(Code + unit + typecheck + runtime health done. Live UI screenshot deferred to
user verification per their choice.)

## Lane

normal

## Product Contract

A claude-pty instance spawned through the runner process surfaces its live
process-tree CPU% and resident memory (current + session peak) to the
`PtyInstancesIndicator` UI, identical to the single-process server path. Before
this change the runner published instance deltas with `rssBytes`/`cpuPercent`
hardcoded `null`, so the UI rendered every field except cpu/mem.

## Relevant Product Docs

- `docs/ARCHITECTURE.md` (runner vs server PTY paths)

## Acceptance Criteria

- Runner-spawned PTY instance deltas carry non-null `rssBytes`, `rssPeakBytes`,
  `cpuPercent`, `cpuPeakPercent` once the sampler has produced a reading.
- Peak values are monotonic non-decreasing across the session.
- Usage deltas carry the instance's current phase (not a stale `spawning`).
- No stray usage delta is published after the session is removed/aborted (must
  not resurrect an instance in the client store).
- Server path (`pty-responders.ts`) behavior is unchanged.

## Design Notes

- Commands: n/a
- Queries: n/a
- API: `StartClaudeSessionPtyArgs` gains optional `onUsageSample` callback
  (additive). Driver's memory-sampler tick invokes it alongside the existing
  `ptyInstanceRegistry?.upsert`.
- Tables: n/a
- Domain rules: runner owns manual delta publishing; `baseInstance` becomes the
  canonical mutable record so phase + usage stay coherent in one object.
- UI surfaces: `PtyInstancesIndicator` (already renders mem/cpu when non-null).

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | driver sampler tick calls onUsageSample with rss/cpu + monotonic peaks; runner publishes updated delta with usage + current phase; stop-flag suppresses post-close samples |
| Integration | runner turn → ptyDeltaSubject delta carries non-null usage |
| E2E | browser-harness: spawn PTY, open indicator, cpu+mem rows visible and updating |
| Platform | macOS `ps` sampler (existing, unchanged) |
| Release | n/a |

## Harness Delta

`harness.db` is not initialized in this checkout (no `scripts/harness init` was
run), so intake/story/trace DB records could not be written. Flagged to user;
git-tracked artifacts (this story + TEST_MATRIX rows) carry the substance.

## Evidence

- Typecheck: `bunx @typescript/native-preview --noEmit -p tsconfig.json` → 0 errors.
- Unit: `driver.test.ts` "memory sampler → onUsageSample emits mapped rss/cpu
  with monotonic peaks" → pass (rss 100→50 keeps peak 100; cpu 10→40 climbs).
- Regression: driver / pty-instance-registry / pty-memory-sampler / store /
  runner suites green (excluding 7 pre-existing parity-matrix failures present
  on clean main HEAD c607df8).
- Runtime: dev `/health` (5175) → natsDaemon ok, natsConnection ok, runner ok
  (registered, heartbeatFresh).
- Live UI screenshot of cpu/mem rows in PtyInstancesIndicator: PENDING — user
  elected to verify in the running app themselves.

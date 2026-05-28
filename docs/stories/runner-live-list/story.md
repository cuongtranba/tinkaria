# US-RLL Runners tab shows a live list of connected runners

## Status

in_progress

## Lane

normal

## Product Contract

The Runners settings tab must show which runners are currently connected, and a
newly-paired runner must appear there on its own (within a couple of seconds of
connecting) without a manual page refresh. After the user generates a pairing
code, the tab shows a "waiting for a runner to connect" affordance that resolves
to the connected runner once it registers.

## Relevant Product Docs

- `docs/TEST_MATRIX.md`
- `src/server/runner-router.ts` (`RunnerDescriptor`, the shape `/health` returns)

## Acceptance Criteria

- The Runners tab renders a "Connected runners" list, polled from the existing
  public `GET /health` `runners[]` every ~2s while the tab is mounted (interval
  cleared on unmount).
- The list is filtered to **relevant** runners: `state` of `online` or `degraded`
  and not `incompatible`. Stale `offline`/`incompatible` tombstones are hidden
  (the KV registry currently has no TTL — separate backlog item).
- Each row shows a short runner name, a state dot (online/degraded), provider
  capabilities, a `shared` badge when applicable.
- After "Generate pairing code", a runner that newly appears (its `runnerId` was
  not present when the code was generated) is highlighted as just-connected; until
  then a "waiting for a runner to connect…" row is shown.
- Empty state (no relevant runners, no active pairing) reads clearly.
- Desktop and mobile layouts both usable (responsive, consistent with other tabs).

## Design Notes

- Commands: —
- Queries: `GET /health` (reused; no new endpoint, no server change).
- API: none added.
- Tables: —
- Domain rules: a runner is "relevant" when `!incompatible && state !== "offline"`.
  "Just connected" = a relevant runnerId absent from the baseline captured at code
  generation.
- UI surfaces: `src/client/app/RunnersTab.tsx`.

Pure helpers extracted to `src/client/app/runner-list.ts`
(`filterRelevantRunners`, `newlyConnectedIds`) and unit-tested without DOM. The
2s polling effect lives in `RunnersTab.tsx`; rendered behavior is proven via
browser-harness against a dev-profile boot (not the live :3210).

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `runner-list.test.ts`: filterRelevantRunners (hides offline/incompatible, keeps online/degraded, sorts online first); newlyConnectedIds (diff against baseline). |
| Integration | n/a (no server change). |
| E2E | browser-harness on dev boot: Runners tab lists the live shared runner; generate code → "waiting" row; (where feasible) a connecting runner appears without refresh. |
| Platform | browser-harness mobile width: list rows usable. |
| Release | — |

## Harness Delta

- Intake #18 recorded.
- TEST_MATRIX rows added.

## Evidence

To be filled after validation runs.

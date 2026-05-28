# US-RTN Runner naming + team management & assignment

## Status

implemented (A1–A4 verified; A5 browser E2E blocked by env — see Evidence)

## Lane

normal

## Product Contract

The operator can: (1) give each remote runner a human name (inline on the Runners
settings tab), (2) manage a flat list of "members" (names only — no auth, no
accounts) in a new Team settings tab, and (3) assign a member to a runner. Names
and assignments are display/grouping metadata only — runner routing/eligibility is
unchanged. State is durable across server restarts and reflected live in the
Runners list and the runner picker dialog.

## Relevant Product Docs

- `.c3/adr/adr-20260528-runner-naming-and-team-assignment.md` (decision + plan)

## Acceptance Criteria

- A1: EventStore reducer handles 4 events (`team_member_saved/removed`,
  `runner_label_set/removed`); member removal cascades `memberId → null`; replay
  from `runner-teams.jsonl` reconstructs state. (unit)
- A2: WS commands `team.member.list/save/remove` + `runner.label.set/remove`
  persist via the store and return correct results. (unit)
- A3: `runner-teams` snapshot derives `{ members, runners }`. (unit)
- A4: Client join `resolveRunnerName(runnerId, labels)` resolves named/unnamed/
  unassigned fallbacks. (unit)
- A5: In the running app — create a member, name a runner inline, assign it; the
  Runners list and picker show name + member; survives reload; `/health` healthy
  and routing unchanged (dual-signal evidence). (e2e)

## Design Notes

- Commands: `team.member.list|save|remove`, `runner.label.set|remove`
- Queries: subscription topic `runner-teams`
- API: none (internal WS only; `/health` unchanged)
- Tables: EventStore log `runner-teams.jsonl`; state maps `teamMembers`, `runnerLabels`
- Domain rules: label is upsert per runnerId; member-removal unassigns; no routing impact
- UI surfaces: Runners tab (inline name + member badge), new Team tab (members CRUD + assignment dropdown), RunnerPickerDialog (read-only name + member)

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | event-store reducer/replay; responders; publisher; runner-list join |
| Integration | WS command round-trip persists + snapshot reflects |
| E2E | name+assign in running app, reload-durable, routing unchanged |
| Platform | n/a (no platform-specific surface) |
| Release | typecheck clean, `git diff --check` clean |

## Harness Delta

TEST_MATRIX rows added for A1–A4; this story recorded via `scripts/harness`.

## Evidence

- A1 ✅ `bun test src/server/event-store-runner-team.test.ts` — 6 pass (reducer, member-removal cascade, log replay, snapshot/compaction round-trip on a real EventStore).
- A2 ✅ `bun test src/server/nats-responders.test.ts` — 5 commands over real embedded NATS + real EventStore; mutating-command broadcast trigger; cascade.
- A3 ✅ `bun test src/server/nats-publisher.test.ts` — `runner-teams` snapshot derive + publish.
- A4 ✅ `bun test src/client/app/runner-list.test.ts` — 16 pass (resolveRunnerName / resolveRunnerMember fallbacks).
- Aggregate: 111 pass across the 6 affected files. `bunx @typescript/native-preview --noEmit` clean. `git diff --check` clean.
- A5 ⛔ BLOCKED — full-stack browser E2E could not run. Booting a second (dev-profile) stack alongside the user's live prod :3210 fails at NATS daemon startup ("NATS daemon produced no output" → nats-server exits 1 before ready). Root cause traced via an isolated async-spawn repro: nats-server + the generated callout config boot fine standalone (streams restore, stays up), so this is a `dev.ts`/daemon-manager orchestration quirk in a co-running multi-instance setup, **not** the feature code. Not pursued further to avoid disrupting the live instance (which was inadvertently interrupted once during diagnosis and has been restored). See implementation-notes.html "A5 blocker" and HARNESS_BACKLOG.

---
id: adr-20260528-runner-naming-and-team-assignment
c3-seal: pending
title: runner-naming-and-team-assignment
type: adr
goal: Let the operator name remote runners and manage a local "team" of members in Settings, assigning each runner to a member for display/grouping only — no auth, no routing change.
status: proposed
date: "2026-05-28"
---

## Goal

Give the single operator three additive capabilities, surfaced in **Settings**:

1. **Name a runner** — a human label per `runnerId` (e.g. "Studio Mac", "EC2 box") replacing the derived `runner-1779…-71677` short name.
2. **Team management** — CRUD a flat list of "members" (names only — *labels, no auth, no accounts*).
3. **Assign a member to a runner** — pure organizational metadata.

**Out of scope (explicit operator decisions, see Context):** no user authentication, no per-user permissions, and **no change to runner routing/eligibility**. Assignment is **display/grouping only**.

## Context

Discovered via c3-design exploration of the remote-runner setup:

- **Runner identity** is auto-generated server-side (`runner-${Date.now()}-${process.pid}`) and surfaced through `runnerShortName()` / `runnerDisplayName()` (last two id segments). There is no human name anywhere.
- **The runner owns its KV registry entry** (`runtime_runner_registry`) and **rewrites it on every heartbeat** (`runner-nats.ts › updateLastSeenAt` spreads `this.registration`). A server-written `displayName`/`memberId` placed in that entry would be clobbered each beat. ⇒ **Names and assignments must live in a separate, server/operator-owned store.**
- **No member/user/auth concept exists.** Pairing endpoints are public ("no user auth"); the codebase repeatedly defers multi-tenancy. `RunnerDescriptor.ownerId` is *carried but never set/enforced* ("deferred to post-PR2").
- **The sibling Settings surface, Provider Profiles, is the established convention** for operator-managed config: persisted as **EventStore events** (`provider_profile_saved/removed` → `profiles.jsonl`), replayed into `store.state`, broadcast via a **NATS snapshot subscription** (`profiles`), and edited through **WS request commands** (`profile.save`/`profile.remove`). The Profiles tab is the direct UI analogue of the Team tab we are adding.

**Persistence decision (operator delegated "you decide"):** use the **EventStore + jsonl + NATS snapshot** pattern, *not* a new NATS KV bucket. Rationale: (a) it is the exact convention for operator-managed settings (Profiles), (b) the runner-registry KV is *runner-owned* and heartbeat-clobbered — wrong ownership domain, (c) we get durable replay + live snapshot/subscription plumbing for free, (d) additive event types replay deterministically — no migration, no data-loss gate.

**Affected topology:**
- `c3-2-server` → **c3-201-event-store** (new event family, log, reducer, state), **c3-204-shared-types** (new types), **c3-205-nats-transport** (responder commands + publisher snapshot).
- `c3-1-client` → **c3-102-stores** (new subscription hook), Settings surface (`SettingsPage`/`RunnersTab`, currently unmapped at component granularity) and `RunnerPickerDialog` (`c3-110`-adjacent chat-ui) for display join.
- The runner **routing** layer (`runner-router.ts`, `runner-manager.ts`, `runner-protocol.ts`) is **deliberately untouched** — display-only keeps routing pure and avoids coupling operator config into selection.

## Decision

Add a **server-owned, EventStore-backed "runner team" model**, mirroring Provider Profiles, and surface it read-only in the two runner display consumers plus a new editable **Team** settings tab. The display surfaces **join `runnerId → {name, memberId}` client-side** against a new `runner-teams` snapshot; `/health` and the router stay unchanged.

Data model (new `src/shared/runner-team-types.ts`):

```ts
export interface TeamMember { id: string; name: string }
export interface RunnerLabel {                 // one per runnerId, upsert
  runnerId: string
  name: string | null                          // human runner name (null ⇒ fall back to short id)
  memberId: string | null                      // assigned member, or unassigned
  updatedAt: number
}
export interface RunnerTeamSnapshot {
  members: TeamMember[]
  runners: RunnerLabel[]
}
```

New events (`RunnerTeamEvent`, added to `StoreEvent`):
`team_member_saved` · `team_member_removed` · `runner_label_set` · `runner_label_removed`.
On `team_member_removed`, the reducer unassigns any runner pointing at it (sets `memberId = null`), mirroring how `provider_profile_removed` cascades into overrides.

## Changes Across Layers

| # | Layer / Doc | Change |
|---|---|---|
| L1 | c3-204 shared-types | New `runner-team-types.ts` (types above). |
| L2 | c3-201 event-store (`events.ts`) | New `RunnerTeamEvent` union (4 events); add to `StoreEvent`; add `teamMembers` + `runnerLabels` maps to `StoreState` and `createEmptyState()`. |
| L3 | c3-201 event-store (`event-store.ts`) | New `runnerTeamsLogPath = runner-teams.jsonl`; wire `ensureFile`, replay, reset/compact, size reporting; 4 reducer cases (incl. member-removal cascade); 4 append mutators. |
| L4 | c3-205 nats-transport (`protocol.ts`) | New `RequestCommand` variants: `team.member.list/save/remove`, `runner.label.set/remove`; new subscription topic `{ type: "runner-teams" }`. |
| L5 | c3-205 nats-transport (`nats-responders.ts`) | Add the 5 commands to the allowlist + handlers delegating to the store mutators. |
| L6 | c3-205 nats-transport (`nats-publisher.ts`) | `deriveRunnerTeamSnapshot(store)` + `case "runner-teams"`. |
| L7 | c3-102 client stores | `useRunnerTeamSubscription(socket)` hook (mirror `useProfileSubscription`); expose snapshot on `AppState`. |
| L8 | Client Settings | New `TeamTab.tsx`: members CRUD + per-runner **member-assignment dropdown** (no name field here); register "Team" tab in `SettingsPage.tsx` (`TinkariaTab`, `TAB_OPTIONS`, `normalizeTinkariaTab`). |
| L9 | Client display + inline naming | `RunnersTab` rows get an **inline editable name field** (writes `runner.label.set`) + member badge; `RunnerPickerDialog` candidates show `name` (fallback to short id) + member badge. Both join by `runnerId` from the subscription. |

## Verification

- V1 — Pure reducer unit tests: each of the 4 events mutates state correctly; `team_member_removed` cascades `memberId → null`; replay from a seeded `runner-teams.jsonl` reconstructs state. (c3-201)
- V2 — Responder unit tests: the 5 commands persist via the store and return `{ ok: true }` / correct lists; unknown command rejected. (c3-205)
- V3 — Publisher unit test: `deriveRunnerTeamSnapshot` shape; `runner-teams` topic returns it. (c3-205)
- V4 — Client join logic unit-tested pure: given runners[] + snapshot, rows resolve correct name/member with fallbacks. (c3-1)
- V5 — End-to-end in the running app (CLAUDE.md dual-signal): create a member, name a runner, assign it; confirm the live Runners list and the picker show the name + member; reload to prove durability; confirm `/health` + server stdout agree and routing is unchanged.

## Implementation Plan

### Code Changes

| Maps L# | File | Specific change |
|---|---|---|
| L1 | `src/shared/runner-team-types.ts` *(new)* | `TeamMember`, `RunnerLabel`, `RunnerTeamSnapshot`, `RunnerLabelRecord`. |
| L2 | `src/server/events.ts` | Add `RunnerTeamEvent` union; append to `StoreEvent`; add `teamMembers: Map<string,TeamMember>` + `runnerLabels: Map<string,RunnerLabelRecord>` to `StoreState` + `createEmptyState()`. |
| L3 | `src/server/event-store.ts` | `this.runnerTeamsLogPath = path.join(dataDir,"runner-teams.jsonl")`; `ensureFile`; `replayLog<RunnerTeamEvent>`; reducer `case`s `team_member_saved/removed`, `runner_label_set/removed`; mutators `saveTeamMember/removeTeamMember/setRunnerLabel/removeRunnerLabel`; add to reset (`Bun.write("")`) + size list. |
| L4 | `src/shared/protocol.ts` | 5 `RequestCommand` variants + `runner-teams` subscription topic in `SubscriptionTopic`. |
| L5 | `src/server/nats-responders.ts` | Add 5 strings to command allowlist (~L177); `case` handlers delegating to store mutators; `team.member.list` returns `[...store.state.teamMembers.values()]`. |
| L6 | `src/server/nats-publisher.ts` | `deriveRunnerTeamSnapshot(store)`; `case "runner-teams"` in snapshot switch. |
| L7 | `src/client/app/useRunnerTeamSubscription.ts` *(new)* + `useAppState.ts` | Subscribe + expose `{ members, runnerLabels }` on `AppState`. |
| L8 | `src/client/app/TeamTab.tsx` *(new)* + `src/client/app/SettingsPage.tsx` | Team tab: members CRUD + per-runner member-assignment dropdown; register tab (`TinkariaTab` union, `TAB_OPTIONS`, `normalizeTinkariaTab`, render branch). |
| L9 | `src/client/app/runner-list.ts`, `src/client/app/RunnersTab.tsx`, `src/client/components/chat-ui/RunnerPickerDialog.tsx` | Pure `resolveRunnerName(runnerId, labels)` join helper; `RunnersTab` inline name field (writes `runner.label.set`) + member badge; `RunnerPickerDialog` shows name + member (read-only). `RunnersTab` gains `state` prop for the socket. |

### Dependencies (order of operations)

1. L1 types → 2. L2/L3 server store (+ V1 tests) → 3. L4 protocol → 4. L5/L6 responder + publisher (+ V2/V3) → 5. L7 client subscription → 6. L8 Team tab → 7. L9 display join (+ V4) → 8. V5 end-to-end in running app.

### Acceptance Criteria

- A1 (V1) `bun test src/server/event-store-runner-team.test.ts` green: 4 events + cascade + replay.
- A2 (V2/V3) `bun test src/server/nats-responders*.test.ts` covers the 5 commands; publisher snapshot test green.
- A3 (V4) `bun test src/client/app/runner-list.test.ts` covers `resolveRunnerName` fallbacks (named / unnamed / unassigned).
- A4 (V5) In `bun run dev`: member created, runner named + assigned, both Runners list and picker show it, survives reload; `/health` healthy and routing path unchanged (dual-signal evidence captured in story `validation`).
- A5 `bunx @typescript/native-preview --noEmit -p tsconfig.json` clean; `git diff --check` clean.

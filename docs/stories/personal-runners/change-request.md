# Change Request: Personal Runners on a Shared Tinkaria

Date: 2026-05-26
Input type: **New initiative** (concept → harness-ready intake)
Source: `docs/concept-personal-runners.html` (full decision-tree design record, May 2026)

> This CR turns the concept into a harness-ready initiative. Per
> `docs/FEATURE_INTAKE.md` and `docs/stories/backlog.md`, it names candidate
> epics and open decisions; it does **not** pre-create every story packet. Each
> epic below becomes a high-risk story folder when the work is selected.

---

## 1. Restated Work Item

Tinkaria runs as one shared instance for the team, but the box has a single
Claude Code account. Make each member run work through the shared instance **on
their own account** — their credentials, their git identity, their usage billed
to them — by running a lightweight `tinkaria-runner` on their own machine.

**Split of authority:** the shared server stays the *brain* (board, tickets,
context, draft PRs, status, UI); each member's runner becomes the *hands* (their
Claude account, git identity, machine, secrets). Tailscale connects them, the
git branch carries the work, and **no secret ever leaves the member's machine.**

The existing architecture is ~80% there: the runner is already a NATS client,
already self-registers in a KV registry, and already has a `RUNNER_MODE=discover`
seam. The work is to make that seam operate **across the network, securely,
per-user.**

## 2. Intake Classification

**Lane: HIGH-RISK** (multi-domain initiative; decompose into epics, each
separately gated).

| Risk flag | Triggered by |
| --- | --- |
| Auth | Pairing tokens, auth-callout JWTs, per-connection credentials |
| Authorization | Per-runner NATS subject scoping; runner→user ownership |
| Data model | `RunnerRegistration` gains `ownerId`/`protocolVersion`/capabilities; registry semantics |
| Audit/security | Credentials stop transiting the server; GitHub App write scope + bot identity audit |
| External systems | Tailscale tailnet, NATS bind change, GitHub App |
| Public contracts | `StartTurnCommand` and `RunnerRegistration` shapes change (client/runner-visible) |
| Cross-platform | Runner on member laptops vs. on the server |
| Existing behavior | `RUNNER_MODE=discover`, `workspace_claim_create`, `process.kill` liveness all change |
| Multi-domain | Networking + auth + git + workspace + distribution at once |

**Hard gates hit:** Auth, Authorization, Audit/security, External provider →
unambiguously high-risk. Each epic below gets a `docs/templates/high-risk-story/`
packet (`execplan.md` / `overview.md` / `design.md` / `validation.md`) and a
decision record before its implementation.

## 3. Scope

**In scope (pilot — internal squad):**

- Per-user runners over a Tailscale tailnet, identity via pairing token.
- Real NATS multi-tenant isolation via server-side auth-callout.
- Git-native board: ticket carries git coordinates; runner materializes the
  workspace locally; branch/PR-level coordination replaces file-level claims.
- Server writes planning artifacts to `.tinkaria/` (bot identity) + auto draft PR;
  runner writes code under the member's identity.
- Heartbeat-TTL liveness with suspend/resume; `protocolVersion` handshake.
- Command split: logical intent server-side, binary + secrets runner-side.

**Parked (not this initiative):**

- WebSocket bridge (`wss://…/runner-ws`) for external teams that can't join a
  tailnet — unblocked later by the isolation work in Epic 1.
- Compiled single-binary runner — squad already has Bun.

**Rejected (record as decisions, do not build):**

- Runner auto-update — hostile + security smell; manual `upgrade` + handshake.
- Server-side filesystem sync / mount — git is the sync layer.
- Silent model downgrade on capability mismatch — refuse with a clear message.

## 4. Candidate Epics

Listed in dependency order. Each is a future high-risk story folder under
`docs/stories/personal-runners/`.

| # | Epic | Concept decisions | Lane | Depends on |
| --- | --- | --- | --- | --- |
| PR1 | **Secure NATS transport & isolation** — bind NATS to the tailnet interface; auth-callout issues per-connection scoped JWTs for *all* clients (browser, server, runners) | 1, 8 | high-risk | — |
| PR2 | **Runner identity & pairing** — "Add my runner" one-time code → durable per-runner secret bound to `TinkariaUser`; `ownerId`; multiple runners per user | 2 | high-risk | PR1 |
| PR3 | **Cross-machine registration & liveness** — `RunnerRegistration` + `ownerId`/`protocolVersion`/capabilities; drop `pid`; heartbeat TTL (degraded 25s / offline 60s); `incompatible` state | 7, 9 | high-risk | PR2 |
| PR4 | **Command profile split** — drop `binaryPath`; `extraEnv` = non-secret only; runner resolves binary + merges local env; capabilities advertised (probe, don't assume) | 10 | high-risk | PR3 |
| PR5 | **Session routing** — sticky-default runner, smart picker when ambiguous/offline, fail-fast with shared-runner (team API key) fallback | 3 | normal | PR3 |
| PR6 | **Git-native workspace** — ticket carries git coordinates; runner builds a worktree off a cached clone; `.tinkaria/workflow.md` hooks; local `~/.tinkaria/secrets/<repo>.env`; branch/PR-level coordination replaces file claims | 4, 11 | high-risk | PR4 |
| PR7 | **Server git write path & draft PR** — write-scoped GitHub App; on "Ready" create branch + commit Context Pack under `.tinkaria/tickets/<id>/` (bot) + open draft PR; pull-before-push helper; suspend/resume from branch | 5, 6 | high-risk | PR6 |
| PR8 | **Runner distribution** — `bunx @tinkaria/runner` (existing `src/runner` entry + pairing + tailnet connect); `pair` / `start` / `upgrade` CLI; no auto-update | 9 | normal | PR2 |

**Suggested sequencing:** PR1 first (everything assumes scoped creds) → PR2 →
PR3 → PR4 → {PR5, PR6} → PR7 → PR8 packaging wraps it.

## 5. Architecture Deltas (as-is → to-be)

Carried verbatim from the concept's delta table; these are the concrete change
surfaces each epic must touch.

| Area | Today | Change | Epic |
| --- | --- | --- | --- |
| NATS bind | `127.0.0.1`, plain TCP + unencrypted WS, single shared token | Bind tailnet interface; per-connection JWTs via auth-callout | PR1 |
| `RunnerRegistration` | `{ runnerId, pid, startedAt, providers }` | + `ownerId`, `protocolVersion`, capabilities; stop relying on `pid` | PR2, PR3 |
| Liveness | `process.kill(pid, 0)` (same-machine only) | Heartbeat TTL: degraded 25s / offline 60s | PR3 |
| `StartTurnCommand` | Server-resolved `binaryPath` + `extraEnv` (secrets) | Drop `binaryPath`; `extraEnv` = non-secret only; runner resolves binary + local env | PR4 |
| Workspace path | Server-supplied absolute `workspaceLocalPath` | Runner-resolved worktree from ticket git coordinates | PR6 |
| Coordination MCP | File-level claims (shared filesystem) | Branch/PR-level coordination (separate clones) | PR6 |
| Runner discovery | `RUNNER_MODE=discover` assumes same-NATS / same-host | Cross-machine, per-user, over the tailnet | PR1, PR2 |
| Git access | None (local FS edits) | Server: write-scoped GitHub App (planning + draft PR + status reads). Runner: member's own git creds (code) | PR7 |

## 6. Validation Shape

| Layer | Expected proof |
| --- | --- |
| Unit | JWT scope enforcement per subject; heartbeat TTL state transitions; capability probe; profile-split serialization (no secret in command) |
| Integration | Pairing handshake → scoped connection; runner registers cross-machine; suspend on heartbeat loss → resume from branch; pull-before-push merge of disjoint paths |
| E2E | Member pairs a runner → PM marks Ready (branch + draft PR appear) → Dev "Start Session" routes to their runner → code lands on the PR under member's git identity |
| Platform | Roaming laptop (wifi→sleep→wake) keeps session suspended-not-failed; offline runner blocks with fail-fast prompt |
| Release | `protocolVersion` mismatch surfaces as `incompatible` (loud), never silent degrade; GitHub App scope audited |

## 7. Open Decisions (need human sign-off before PR1)

These map to the concept's "Open Implementation Risks" and must each land as a
`scripts/harness decision add` + `docs/decisions/NNNN-*.md`:

1. **Auth-callout breadth.** Migrating *all* NATS connections (browser, server,
   runners) onto callout-issued JWTs is the largest single piece and a hard
   prerequisite. Confirm we sequence it first and accept the blast radius.
2. **GitHub App scope.** Server write access to tracked repos is real blast
   radius — scope to branch + `.tinkaria/` commits + PR open/status, and audit
   the bot identity. Confirm the scope boundary.
3. **Pull-before-push race.** Disjoint-path rule makes merges automatic but the
   runner must reliably pull before pushing — needs a tested helper, not ad-hoc
   git. Confirm we build the helper as part of PR7.
4. **Capability advertisement accuracy.** Runner must probe real installed
   models/providers, not assume — else sessions fail at turn time, not routing.
5. **Preflight secret check.** Required-key validation needs `workflow.md` and
   the member's local env to agree; a missing key must surface on the board
   *before* session start. Confirm the preflight UX.
6. **Tailnet operational cost.** Every member must join the tailnet. Confirm
   acceptable for the pilot squad (concept assumes yes).

## 8. Harness Delta

- Add the eight candidate epics to `docs/stories/backlog.md` (done with this CR).
- **Next gated steps (await approval of §7):**
  - `scripts/harness intake` to record this initiative's high-risk classification.
  - Per selected epic: create a `docs/templates/high-risk-story/` folder under
    `docs/stories/personal-runners/`, add `docs/TEST_MATRIX.md` rows, and record
    the relevant decision(s).
  - Run impact analysis (`gitnexus_impact`) on the touched symbols
    (`RunnerRegistration`, `StartTurnCommand`, runner-nats, discover seam,
    `workspace_claim_create`) before any edit.

## 9. In One Line

The shared server is the team's brain; each member's runner is their hands.
Tailscale connects them, the branch carries the work, the auth-callout isolates
them, and nothing private ever leaves the laptop.

# Design — PR5 Session Routing

## Contract

> **A session is dispatched to a *selected* runner, not a fixed one.** Selection
> is sticky-default, capability- and liveness-aware, with an explicit picker when
> ambiguous, a shared-runner fallback, and fail-fast when nothing is eligible. The
> selected runner is persisted on the chat (`chat.runnerId`) and only recomputed
> when it stops being eligible.

## New surface: `RunnerRouter` (`src/server/runner-router.ts`)

Owns enumeration + selection. Reads `RUNNER_REGISTRY_BUCKET`; does **not** own
runner lifecycle (that stays in `RunnerManager`).

```ts
type RunnerDescriptor = {
  runnerId: string
  state: RunnerLivenessState          // PR3: online | degraded | offline
  capabilities: RunnerCapabilities | null  // PR4: { providers, ... }
  protocolVersion: number | null
  incompatible: boolean               // PR3 compat check
  lastSeenAt: number | null
  pid: number | null
  ownerId: string | null              // carried, not yet enforced (deferred)
  isShared: boolean                   // true for the server-spawned runner
}

type RunnerSelection =
  | { kind: "selected"; runnerId: string; sticky: boolean }
  | { kind: "needs_pick"; candidates: RunnerDescriptor[]; reason: "ambiguous" | "sticky_offline" }
  | { kind: "unavailable"; reason: string }

class RunnerRouter {
  constructor(opts: { nc: NatsConnection; sharedRunnerId: () => string | null })
  async list(now?: number): Promise<RunnerDescriptor[]>      // all KV entries, annotated
  async get(runnerId: string): Promise<RunnerDescriptor | null>
  async select(req: {
    provider: AgentProvider
    preferredRunnerId?: string | null   // chat.runnerId sticky pin
    now?: number
  }): Promise<RunnerSelection>
}
```

### Liveness + eligibility

Reuse `runnerLivenessState(lastSeenAt, now)` (PR3) and `isProtocolSupported`
(PR3). A runner is **eligible** for a provider when:
`state !== "offline"` **AND** `!incompatible` **AND**
`(capabilities === null || capabilities.providers.includes(provider))`.

`capabilities === null` (pre-PR4 runner) is treated as **capable** — fail-open for
capability, matching PR4's gate (the turn-start gate still catches a real mismatch
loudly). Liveness and compat are **fail-closed** (offline/incompatible runners are
never eligible).

### Selection policy (deterministic)

```
eligible = list().filter(eligibleFor(provider))
if preferredRunnerId is set:
  d = eligible.find(r => r.runnerId === preferredRunnerId)
  if d:        return { selected, runnerId: d.runnerId, sticky: true }       # zero clicks
  if sticky runner exists but is NOT eligible:
               return { needs_pick, candidates: eligible, reason: "sticky_offline" }
if eligible.length === 0:  return { unavailable, reason: "<provider> has no online runner ..." }
if eligible.length === 1:  return { selected, runnerId: eligible[0], sticky: false }  # zero clicks
                           return { needs_pick, candidates: eligible, reason: "ambiguous" }
```

Shared-runner fallback is **not** a separate branch: the server-spawned runner is
just another entry in `list()` (flagged `isShared`). When a member has no personal
runner, it is the sole eligible → auto-selected. Tie-break for display ordering:
shared last, then by `lastSeenAt` desc.

## Refactor: `RunnerProxy` — single → per-session dispatch

The invariant change: `runnerId` is no longer a constructor constant; it is
resolved **per chat** at dispatch time.

```ts
interface RunnerProxyOptions {
  // ...existing (nc, store, getActiveStatuses, runtimeRegistry)...
  router: RunnerRouter
  sharedRunnerId: () => string                       // RunnerManager.getRunnerId()
  getRunnerReadiness?: (runnerId: string) => { incompatible; protocolVersion; capabilities? }
}
```

- **`resolveRunnerForChat(chatId, provider): Promise<string>`** — the new private
  heart:
  1. `chat = store.requireChat(chatId)`; `preferred = chat.runnerId ?? null`.
  2. `sel = router.select({ provider, preferredRunnerId: preferred })`.
  3. `selected` → if `!sticky` or runner changed, persist via
     `store.setChatRunner(chatId, runnerId)`; return runnerId.
  4. `needs_pick` → throw a typed `RunnerPickRequired` error carrying candidates
     (the WS layer turns it into a `chat.runnerPickRequired` event for the picker).
  5. `unavailable` → throw a clear `Error(reason)` (fail-fast).
- **`sendCommand(cmd, payload, runnerId)`** — now takes the resolved runnerId;
  `runnerCmdSubject(runnerId, cmd)`. The compat/capability gate consults
  `getRunnerReadiness(runnerId)` for **that** runner (from the router descriptor),
  not the single RunnerManager readiness.
- Every public method (`send`, `startTurnForChat`, `drainQueuedTurn`,
  `drainDelegationResult`, `cancel`, `respondTool`, `disposeChat`) resolves the
  runner for its `chatId` first. For non-start commands (`cancel`, `respond_tool`,
  `stop_chat_pty`) the runner **must** be the chat's already-pinned `runnerId`
  (don't re-route mid-session) — use `chat.runnerId` directly, falling back to the
  shared runner only if unset.

### Why sticky pin (persisted) over per-turn selection

A turn, its `cancel`, its tool responses, and its PTY teardown must all reach the
**same** runner — the session (claude-pty child, OAuth pool reservation, MCP
server) lives on one machine. Per-turn re-selection could strand an in-flight
session on a now-different runner. So selection happens once (first turn / explicit
pick), is persisted, and is honored for the chat's life unless the runner goes
offline (→ picker). This is the concept's "sticky-default."

## Persistence: `chat.runnerId`

Additive, optional field on the chat record (`EventStore`). New helper
`store.setChatRunner(chatId, runnerId | null)` appends a chat-meta event (same
pattern as `setChatProvider`/`setChatModel`). Absent on existing chats → treated as
"no sticky pin" → selection runs normally on next turn. **No migration needed**
(additive optional field; pre-PR5 chats simply have `runnerId === undefined`).

## Surfaces

- **`/health`** — `ServerHealthcheck` gains `runners: RunnerDescriptor[]`
  (`router.list()`); existing `runner` stays for back-compat (the shared/local
  runner). `ok` logic unchanged (still gated on the shared runner being healthy so
  the server itself is usable).
- **Client picker** — when the WS receives `chat.runnerPickRequired`
  `{ chatId, candidates, reason }`, render a runner picker (online runners +
  machine name + capabilities). Selecting one sends `chat.selectRunner`
  `{ chatId, runnerId }`; the server persists it and retries the pending send.
  **Zero-click path** (sticky/sole-eligible) never shows the picker. A small
  "runner: <name>" affordance in the composer lets a user re-pick deliberately.

## Risk & blast radius

- **HIGHEST: `RunnerProxy` is the turn-dispatch chokepoint.** Every existing
  turn-path test exercises it. Mitigation: keep the single-runner behavior
  bit-identical when there is exactly one eligible runner (the overwhelmingly
  common case today) — the refactor must be a *superset*, proven by the existing
  `runner-proxy.test.ts` suite staying green unchanged.
- GitNexus impact analysis is **unavailable** (index read-only all session) — the
  compensating control is the existing test suite + a dedicated-port boot
  dual-signal verify + code review, exactly as for PR1–PR4.
- Concurrency: `list()` reads KV each selection; selection is cheap and only on
  turn start. No caching in PR5 (avoid stale-eligibility bugs); revisit if hot.

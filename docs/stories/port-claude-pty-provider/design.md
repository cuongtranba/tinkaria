# Design — Port claude-pty Provider from kanna

## Domain Model

**Entities**

- `PtyInstance` (one per `chatId`): immutable spawn record + mutable
  runtime state. Lifecycle phases:
  `spawning → trust-dialog? → ready → streaming → cancelling → exited`.
  Source-of-truth: `src/shared/pty-instance.ts` (ported verbatim from
  kanna with no shape change).
- `OAuthPoolToken`: opaque string + label, supplied at spawn time via
  `CLAUDE_CODE_OAUTH_TOKEN`. `ANTHROPIC_API_KEY` is stripped from the
  child env unconditionally. The pool comes from `appSettingsStore`
  (client) + a server-side `oauth-token-pool` adapter (already shipped
  in tinkaria? — verify in implementation; if not, port from kanna).
- `ClaudeSessionEntry`: per-PID file written by claude CLI at
  `~/.claude/sessions/<pid>.json`. Read-only to us.
- `ClaudePtyEntry`: persisted PID record under
  `<runtimeDir>/claude-pty-registry.json` for crash-time reaping.

**Value objects**

- `PtyInstancePhase`, `PtyInstanceSmokeTest`, `PtyInstanceDelta`
  (added/updated/removed).
- `OutputRing` — capped (256 KB default) string buffer for marker scans.
- `ProcessTreeSample` — RSS/CPU snapshot for the child + descendants.

**Business rules**

- OAuth-pool token required. No API key fallback. No
  `claude /login` keychain path.
- One PTY per `chatId`. Re-spawning while one is live is a no-op (or
  explicit cancel).
- Smoke-test gate must pass once per binary SHA-256 before the
  first prompt commits; failure surfaces in the Settings UI.
- `phase === "exited"` entries auto-prune after 60s (kanna default).
- Trust-dialog (first-run `claude --dangerously-skip-permissions`
  banner) is auto-dismissed by the TUI control sequence.

## Application Flow

**Commands (NATS subjects, all under `pty.*` namespace)**

| Subject | Direction | Payload |
| --- | --- | --- |
| `pty.spawn.<chatId>` | client → server | `{cwd, model, accountLabel, planMode}` |
| `pty.input.<chatId>` | client → server | `{data: string}` (raw bytes from chat input) |
| `pty.resize.<chatId>` | client → server | `{cols, rows}` |
| `pty.cancel.<chatId>` | client → server | `{}` (SIGTERM → SIGKILL grace) |
| `pty.exit.<chatId>` | client → server | `{}` (graceful `/exit`) |
| `pty.delta` | server → client (broadcast) | `PtyInstanceDelta` |
| `pty.snapshot.req` | client → server (request/reply) | `{}` → `PtyInstanceState[]` |

**Handlers (server)**

- `claude-pty/driver.ts::startClaudePtySession()` — orchestrates spawn,
  TUI ready wait, JSONL pipe, registry upsert, smoke gate, OAuth-pool
  fetch, runtime-dir lifecycle.
- `pty-instance-registry.ts` — in-memory state + coalesced delta fan-out
  over the NATS `pty.delta` subject.
- `pid-registry.adapter.ts` — disk-backed crash-recovery registry.

**Queries**

- `getPtyInstances()` → server-side snapshot, served on
  `pty.snapshot.req`.
- `getSupportedCommands(chatId)` → slash commands sourced from the
  live `system_init` JSONL event; falls back to static list.

## Interface Contract

**Provider-level (existing `c3-211 providers` registry)**

Register new provider id `claude-pty` with capability flags:

```ts
{
  id: "claude-pty",
  kind: "process",         // not "http" like the API provider
  models: <discovered at spawn>,
  features: { oauthPool: true, apiKey: false, planMode: true, mcp: true },
  selectable: true,
}
```

**RunnerProxy mapping (existing `c3-210 agent`)**

The PTY driver MUST produce the same `HarnessEvent` stream shape as the
SDK-based provider so transcript-renderer (`c3-119`) and event-store
(`c3-201`) do not branch. `jsonl-to-event.ts` is the seam. Usage
snapshots, context-window floors, and assistant-message dedup all
reuse the existing `agent.ts` normalizers via ported wrappers.

**Client store**

`src/client/stores/ptyInstancesStore.ts` — Zustand store subscribing
to `pty.delta`, exposing `instances: Record<chatId, PtyInstanceState>`,
`spawn(chatId, opts)`, `sendInput`, `resize`, `cancel`.

**UI surfaces**

- `PtyInstancesIndicator.tsx` — header chip showing live count + last
  phase. Click opens a popover with per-chat detail. Lives next to the
  existing model indicator.
- `SettingsPage` — new section "Claude PTY":
  - Binary path field (default: resolved from PATH).
  - OAuth-pool token table (label, masked token, last-used).
  - Smoke-test status per binary SHA.
  - Toggle: enable provider.

## Data Model

**On-disk**

- `<runtimeDir>/claude-pty-registry.json` — `{entries: ClaudePtyEntry[]}`.
  Append-rewrite on every spawn/remove. Read at boot for orphan reaping.
- `<runtimeDir>/<spawnId>/mcp-config.json` — generated per spawn,
  removed on exit.
- `<runtimeDir>/<spawnId>/settings.json` — generated per spawn,
  removed on exit.
- `<XDG_CACHE_HOME>/tinkaria/smoke-test/<binarySha>.json` — smoke-test
  pass marker (avoids re-running per boot).

**In-memory**

- `Map<chatId, PtyInstanceState>` keyed by chatId.
- `OutputRing` per live PTY.
- `Set<assistantUsageId>` per JSONL parser to dedupe usage snapshots.

**Migrations**

None. New persistent files; no schema changes to `event-store` JSONL
(events emitted are already-shaped `HarnessEvent`s).

**Retention**

- Exited registry entries auto-prune after 60s in memory.
- On-disk PID-registry entries cleaned up on graceful exit; orphans
  reaped at next boot.
- Runtime dirs (`<runtimeDir>/<spawnId>/`) removed on every exit path,
  including crash-reap.

## UI / Platform Impact

- **Browser**: new indicator chip + new Settings section. Existing chat
  input wires raw keystrokes through `pty.input.<chatId>` when active
  provider is `claude-pty` (otherwise normal turn path).
- **Mobile**: indicator hidden on small breakpoints (existing pattern).
- **CLI** (`c3-203`): no change.
- **Deployment**: requires Bun 1.3.5+ (`Bun.Terminal`). Document in
  CLAUDE.md verification block.
- **Platform shell**: macOS + Linux only. Windows is non-goal.

## Observability

- **Logs**: prefixed `[claude-pty]` per `rule-prefixed-logging`.
  Spawn args (redacted), exit codes, signals, smoke gate verdicts,
  PID-registry reap counts.
- **Events**: PTY-specific `HarnessEvent`s mapped from JSONL into the
  same event-store stream; no new event kinds.
- **Metrics**: RSS / CPU samples (10s cadence) per PTY, peaked in
  registry state.
- **Audit**: OAuth-pool token use is logged with masked token + label
  but never the raw secret. `ANTHROPIC_API_KEY` strip is logged as a
  one-line warning when the parent env has one.

## Alternatives Considered

1. **Sandbox the PTY (kanna parity).** Port `claude-pty/sandbox/*`
   (seatbelt + bwrap profiles + wrap adapter). REJECTED by user: "no
   sandbox". Documented as accepted risk in ADR. Re-evaluate if PTY
   leaves dev environments.
2. **Use raw WebSocket for PTY byte stream (kanna parity).**
   REJECTED. Tinkaria's NATS-WS is the only transport per
   `ref-ref-websocket-protocol` / `ref-nats-transport-hardening`.
   Adding a raw WS would fork the transport story.
3. **Stub kanna driver deps (mcp-http, subagent-orchestrator,
   tool-callback, cloudflare-tunnel-gateway).** REJECTED by user:
   "port whole dep tree" — bring all transitive modules. Conflicts
   with existing tinkaria components (`c3-210 agent`, `c3-215 share`,
   `c3-206 orchestration`); reconciliation map below.
4. **MVP only (process + driver + registry + UI).** REJECTED by user:
   full port.

## Dependency Reconciliation (kanna → tinkaria)

Driver pulls 9 sibling modules. Each must either reuse an existing
tinkaria component or be ported as a new one. Conflicts surfaced
here for human decision before implementation begins.

| Kanna module | LOC | Tinkaria equivalent | Action |
| --- | --- | --- | --- |
| `claude-pty/*` (35 files) | ~3.5k | none | Port verbatim into `src/server/claude-pty/`. |
| `kanna-mcp-http.ts` | 177 | none (tinkaria has MCP tools but not an HTTP server for them) | Port as `tinkaria-mcp-http.ts` or reuse `kanna-mcp-http` naming. **OPEN: name + ownership.** |
| `kanna-mcp.ts` | 406 | partial (`c3-227 extension-router` hosts MCP-shaped surfaces) | **OPEN: extend extension-router or port wholesale?** |
| `subagent-orchestrator.ts` | 884 | `c3-206 orchestration` exists with `SessionOrchestrator` | **CONFLICT.** Two orchestrators in the same server == hazardous. **OPEN: merge or namespace?** |
| `tool-callback.ts` | 274 | partial (tinkaria has tool-call wiring inside agent) | **OPEN: extract or duplicate?** |
| `cloudflare-tunnel/*` | 770 | `c3-215 share` covers tunnel | **OPEN: replace c3-215 or skip tunnel integration in PTY driver?** Driver only uses the gateway type; can be made optional. |
| `kanna-system-prompt.ts` | 101 | none | Port as `tinkaria-system-prompt.ts`. The PTY driver appends this to claude's system context. **OPEN: rename "kanna" → "tinkaria" in prompt text or keep as-is?** |
| `auto-continue/limit-detector.ts` | 194 | none | Port as-is (only used by jsonl-to-event). |
| `agent.ts` normalizers (`parseConfiguredContextWindowFromModelId`, `timestamped`, `normalizeClaudeStreamMessage`, `normalizeClaudeUsageSnapshot`, `resolveFinalTurnUsage`, `maxClaudeContextWindowFromModelUsage`, `getClaudeAssistantMessageUsageId`) | ~3.5k file, only a few exports used | `c3-210 agent` exists | **OPEN: re-export needed symbols, or duplicate?** |
| `permission-policy.ts` | 136 | partial — tinkaria has its own permission gate | **OPEN: reuse tinkaria's or port kanna's verbatim?** |
| `harness-types.ts` | n/a | `c3-204 shared-types` covers events | **OPEN: merge HarnessEvent shapes or keep two?** |
| `terminal-manager.ts` | 382 | none (generic shell terminal, not claude PTY) | Out of scope per overview Non-Goals. |

**Net new components in `.c3/c3-2-server/`** (proposed):

- `c3-228-claude-pty` (this story).
- Possibly `c3-229-mcp-http` if kanna-mcp-http is ported as its own
  component rather than extending `c3-227 extension-router`.

## Stop Conditions

Pause for human confirmation BEFORE implementation if any open
question in the reconciliation table above lands on a conflict
(orchestrator merge, c3-215 replacement, permission-policy choice,
mcp-http ownership). These cannot be resolved by reading code alone.

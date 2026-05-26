# 0007 Port claude-pty Provider from kanna

Date: 2026-05-26

## Status

Proposed

## Context

Tinkaria currently runs Claude turns only through the Anthropic Messages
API (`c3-210 agent`) and runs Codex CLI turns through `c3-216 codex`.
The user wants to add a PTY-based path that runs the local `claude` CLI
inside a Bun.Terminal PTY, billed against an OAuth-pool token rather
than `ANTHROPIC_API_KEY`. The kanna repo already ships this surface as
`src/server/claude-pty/*` (35 files, ~7k LOC) plus 9 sibling modules
(~10k LOC) and ports of its protocol + Settings UI. The user has chosen
to bring the full dep tree.

## Decision

1. Add `claude-pty` as a new provider in `c3-211 providers` alongside
   the existing API and Codex providers — no replacement of either.
2. Route PTY byte streams over the existing NATS transport
   (`c3-205 nats-transport`) under the `pty.*` subject namespace. Do
   not add a raw WebSocket endpoint.
3. Do NOT port kanna's sandbox subtree (`claude-pty/sandbox/*`). The
   spawned `claude` CLI runs at full user privilege — accepted risk
   for local-developer-only deployment.
4. Port the full driver dependency tree (kanna-mcp-http, kanna-mcp,
   subagent-orchestrator, tool-callback, kanna-system-prompt,
   auto-continue/limit-detector, permission-policy, selected
   `agent.ts` normalizers) under `src/server/claude-pty/` and clearly
   namespaced siblings, isolated from existing tinkaria components.
   Existing components (c3-206 orchestration, c3-215 share, c3-227
   extension-router, c3-210 agent) are NOT replaced — the PTY driver
   adapts to their exported types where overlap exists. Reconciliation
   table in `docs/stories/port-claude-pty-provider/design.md` records
   each conflict.
5. Expose the provider in the Settings page with a binary-path field,
   OAuth-pool token table, smoke-test status per binary SHA, and an
   enable toggle.
6. Create a new component `c3-228 claude-pty` in `.c3/c3-2-server/`
   with Parent Delta recorded in the container README.

## Alternatives Considered

1. **Mirror kanna verbatim including sandbox + raw WS.** Rejected:
   diverges from tinkaria's NATS transport spine and the user
   explicitly opted out of sandboxing.
2. **MVP-only (process + driver + registry + minimal UI).** Rejected
   by user — full parity wanted.
3. **Replace tinkaria's API provider with PTY.** Rejected — PTY runs
   alongside, not as a swap.
4. **Replace tinkaria's `c3-206 orchestration` with kanna's
   `subagent-orchestrator.ts`.** Rejected — two orchestrators in one
   server is hazardous; the ported orchestrator stays scoped to
   the PTY driver until a follow-up consolidation story.

## Consequences

Positive:

- OAuth-pool / subscription billing path becomes available.
- Long-lived TUI session features (slash commands, plan mode,
  in-session model switch) become available without rebuilding the
  CLI's TUI on top of the API.
- Parity with kanna lets users move workflows over without re-config.

Tradeoffs:

- No sandbox: spawned `claude` runs as the server user. Re-evaluate
  before any non-localhost deployment.
- ~10k LOC of code surface added at once — high review cost; high
  test-matrix breadth.
- Two orchestrators temporarily coexist (PTY-local vs server-global).
- Existing transcript-renderer + event-store paths must stay
  unchanged; jsonl-to-event maps onto the existing `HarnessEvent`
  shape.

## Follow-Up

- Open backlog item to revisit sandbox before any non-developer use.
- Open backlog item to consolidate the PTY-local subagent
  orchestrator with `c3-206 orchestration`.
- Open backlog item to consider folding `kanna-mcp-http` into
  `c3-227 extension-router`.
- Resolve the 8 reconciliation OQs in
  `docs/stories/port-claude-pty-provider/implementation-notes.html`
  before code edits begin.

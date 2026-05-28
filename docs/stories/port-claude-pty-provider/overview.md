# Overview — Port claude-pty Provider from kanna

## Current Behavior

Tinkaria runs Claude turns exclusively through the Anthropic Messages API
via `c3-210 agent` (RunnerProxy + provider harness) and runs Codex CLI
turns through `c3-216 codex`. There is no PTY-based path: the user cannot
drive a long-lived `claude` TUI subprocess from the web UI, and OAuth-pool
billing through the CLI's subscription path is unavailable.

## Target Behavior

A new `claude-pty` provider runs the local `claude` CLI inside a PTY,
streams its JSONL transcript into the existing event store, and forwards
keystrokes from the chat input through NATS subjects. The provider is
selectable from the Settings page (alongside the existing providers),
exposes a configurable binary path, surfaces session phase + smoke-test
status, and bills against an OAuth-pool token rather than the
`ANTHROPIC_API_KEY` API path. Crash recovery on next boot reaps orphan
processes via a persisted PID registry.

## Affected Users

- **Local operator** — picks `claude-pty` in Settings, sees PTY session
  health (spawning / trust-dialog / ready / streaming / cancelling /
  exited), token in/out counters, RSS/CPU peak, and exit codes.
- **Subagent / delegation flows** — can target a PTY-backed claude turn
  through the same RunnerProxy seam used by API turns.
- **Crash-recovery operator** — does not have to manually `kill` orphan
  `claude` PIDs after `bun run dev` exits non-gracefully.

## Affected Product Docs

- `docs/ARCHITECTURE.md` — add `claude-pty` to the server component map.
- `docs/HARNESS.md` — no change expected.
- `docs/FEATURE_INTAKE.md` — no change expected.
- `.c3/c3-2-server/` — new component file `c3-22X-claude-pty.md` plus
  Parent Delta entry in `.c3/c3-2-server/README.md`.
- New ref candidate: `ref-pty-runtime-supervision` (process lifecycle,
  PID registry, smoke-test gate) — created later in change flow.

## Non-Goals

- Sandbox isolation (seatbelt/bwrap). Explicitly out of scope per
  ADR; documented as accepted risk. Kanna's `claude-pty/sandbox/*`
  files are NOT ported.
- Replacing the existing API-path Claude provider. PTY runs alongside.
- Mobile / PWA-specific UX for PTY status. Desktop browser only.
- Multi-PTY-per-chat fan-out. One PTY instance per chatId.
- Cross-platform Windows support. macOS + Linux only (matches kanna).
- Port of kanna's `terminal-manager.ts` generic terminal feature. Only
  the claude-specific PTY mode is in scope (terminal-manager is a
  general shell terminal — not a Claude provider).

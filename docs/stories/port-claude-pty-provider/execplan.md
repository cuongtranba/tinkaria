# Exec Plan — Port claude-pty Provider from kanna

## Goal

Land a new `claude-pty` provider in tinkaria that runs the local
`claude` CLI in a PTY, streams its JSONL into the existing event
store, routes byte-stream IO over NATS, surfaces session health in
the Settings page, and reaps orphan processes on crash recovery.
Full kanna feature parity in scope; sandboxing explicitly omitted.

## Scope

### In scope

- Port all 35 files under `src/server/claude-pty/` EXCEPT the
  `sandbox/` subtree (12 files).
- Port `src/shared/pty-instance.ts`.
- Port `src/client/stores/ptyInstancesStore.ts`.
- Port `src/client/components/chat-ui/PtyInstancesIndicator.tsx`.
- Port driver-required server siblings (kanna-mcp-http, kanna-mcp,
  subagent-orchestrator, tool-callback, cloudflare-tunnel, kanna-system-prompt,
  auto-continue/limit-detector, permission-policy) — with conflict
  reconciliation per design.md (BLOCKING decisions before code).
- Register `claude-pty` in `c3-211 providers`.
- Add Settings page section (`claude-pty` provider config: binary path,
  OAuth-pool, smoke-test status, enable toggle).
- New NATS subjects under `pty.*`.
- New `.c3/` component `c3-228-claude-pty` + Parent Delta in
  `.c3/c3-2-server/README.md`.
- New ref `ref-pty-runtime-supervision` (optional — defer if not
  needed).
- Crash-recovery PID-registry reap on boot.
- Wire chat input → `pty.input.<chatId>` when provider == `claude-pty`.

### Out of scope

- Sandbox isolation (seatbelt / bwrap / wrap adapter).
- Generic `terminal-manager.ts` shell terminal (not claude-specific).
- Windows support.
- Mobile-optimized PTY indicator UX.
- Replacing the existing API-path Claude provider.

## Risk Classification

**Lane: high-risk**

### Risk flags (10/10)

- Auth (OAuth-pool token handling).
- Authorization (token-pool gating, masked logging).
- Data model (new PtyInstanceState, on-disk PID registry).
- Audit/security (spawning external CLI at user privilege, NO sandbox).
- External systems (claude CLI binary, JSONL contract, ~/.claude/sessions/*.json).
- Public contracts (new NATS subjects, new provider id, new client store API).
- Cross-platform (Bun.Terminal on macOS + Linux, divergent PID semantics).
- Existing behavior (provider registry, agent harness shape, chat input wiring).
- Weak proof (porting from another repo — needs replay of kanna tests).
- Multi-domain (server + client + shared + protocol + Settings UI).

### Hard gates triggered

- External provider (new `claude-pty`).
- Auth (OAuth-pool, env-strip).
- Audit/security (no sandbox — accepted risk recorded in ADR).
- Public contracts (NATS subject namespace `pty.*`).

## Work Phases

1. **Discovery** — [DONE] Kanna PTY surface catalogued (35 files +
   ~7k LOC, 9 sibling deps ~10k LOC). Tinkaria neighbors mapped via
   C3 (c3-210, c3-211, c3-215, c3-206, c3-216).
2. **Design** — [DONE in design.md, with reconciliation conflicts
   flagged]. STOP here for user resolution of open questions.
3. **Validation planning** — Write TEST_MATRIX rows BEFORE
   implementation (kanna parity matrix is the seed; remove sandbox
   rows; add NATS-subject rows).
4. **Implementation** — Top-down per dependency:
   1. `src/shared/pty-instance.ts` + `src/shared/protocol.ts`
      additions for `pty.*` subjects.
   2. `src/server/claude-pty/pty-process.adapter.ts` + tests.
   3. `OutputRing`, `tui-control`, `tui-source` adapters + tests.
   4. `pid-registry`, `pty-instance-registry`, `claude-session-registry`.
   5. `jsonl-path`, `jsonl-to-event`, `resolve-binary`, `runtime-dir`,
      `settings-writer`, `smoke-test`, `preflight`.
   6. Sibling deps per reconciliation table (mcp-http, mcp, system-prompt,
      auto-continue/limit-detector, permission-policy, agent normalizers,
      cloudflare-tunnel gateway type — only if conflicts resolved as
      "port whole").
   7. `driver.ts` (stitches everything).
   8. Register provider in `c3-211 providers`.
   9. Server wiring: NATS subscriptions, snapshot endpoint, boot-time reap.
   10. Client store `ptyInstancesStore`.
   11. `PtyInstancesIndicator`, Settings section.
   12. Chat input wiring.
5. **Verification** — End-to-end per CLAUDE.md `<important>` block:
   `bun run dev`, `curl /health`, browser-harness drive, screenshot,
   dual-signal log read.
6. **Harness update** — Update story status `implemented`, fill
   `validation.md` with evidence, mark backlog items, record trace.

## Stop Conditions

Pause for human confirmation if:

- Reconciliation table in `design.md` open questions are not resolved
  (this is the next blocker).
- A ported kanna module reveals additional dep edges not catalogued
  here (transitive blow-up).
- A test fails in a way that requires weakening an existing tinkaria
  contract (auto-continue, transcript-renderer, provider harness).
- Smoke-test gate behaviour drifts from kanna (cross-binary regression).
- `Bun.Terminal` is unavailable in the project's Bun version (need
  upgrade decision).
- Settings page section conflicts with `impeccable` UI rules around
  the existing model indicator chip layout.

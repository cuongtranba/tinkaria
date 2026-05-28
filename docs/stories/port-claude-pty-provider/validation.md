# Validation — Port claude-pty Provider from kanna

## Proof Strategy

Three layers must agree before this story can be marked `implemented`:

1. **Unit + adapter parity** — every ported `claude-pty/*` file
   reproduces the kanna test verdict (same assertions, no
   skipped/weakened tests beyond the sandbox subtree which is out
   of scope). `parity-matrix.test.ts` is the executable seed.
2. **End-to-end runtime proof** — a real `claude` CLI spawn inside
   the tinkaria server reaches `phase: "ready"`, accepts a prompt,
   emits assistant + result JSONL, and writes the same shape into
   the existing event store as the SDK provider. Verified per
   CLAUDE.md `<important>` block (curl /health + browser-harness +
   dual-signal logs).
3. **Crash-recovery proof** — kill `bun run dev` with `SIGKILL`,
   confirm the child `claude` survives (Bun.Terminal setsid), then
   restart and confirm boot-time reap removes the PID and its
   runtime dir.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | OutputRing capacity + tail; tui-control marker matching with ANSI stripped; pid-registry register/load/remove/reap; jsonl-to-event normalization parity; smoke-test cache hit/miss; resolve-binary PATH search; auth verify (OAuth ok, no-token reject); jsonl-path computation; runtime-dir create/write/remove. |
| Integration | Driver spawn → ready → prompt → result happy path; driver cancel mid-stream (SIGTERM grace, SIGKILL escalation); driver crash-reap on next boot; PtyInstanceRegistry coalesce window; provider registration in c3-211; NATS pty.* subject round-trip. |
| E2E | Browser-harness drives a real `claude` PTY turn from chat input through to transcript render; Settings page configures binary path + OAuth-pool token + sees smoke-test status; PtyInstancesIndicator opens popover with live phase. |
| Platform | macOS spawn + signal handling; Linux spawn + signal handling; Bun.Terminal availability gate (refuses to register provider if Bun < 1.3.5). |
| Performance | OutputRing memory bound under 1MB stdout burst; coalesced deltas no more than 10/s per chat under continuous streaming; RSS sampling cadence 10s, no leak across 100 spawn/exit cycles. |
| Logs/Audit | `[claude-pty]` prefix every line; OAuth token masked in every emission; ANTHROPIC_API_KEY strip logged once per spawn; smoke-test verdict logged with binary SHA; PID-registry reap count logged at boot. |

## Fixtures

- **Synthetic `claude` binary**: a small Bun script that emits a known
  JSONL stream + responds to `system_init` / `prompt` markers, used in
  driver integration tests so CI does not depend on the real CLI.
- **OAuth-pool token sentinel**: literal `"oauth-test-token"`, masked
  in logs as `oa***ken`.
- **Smoke-test cache directory**: per-test temp dir under
  `bun:tmp/<id>/smoke-test/`, removed in `afterEach`.
- **Pre-seeded JSONL transcript**: `fixtures/claude-jsonl/happy.jsonl`
  copied verbatim from kanna for jsonl-to-event regression.

## Commands

```text
# Typecheck (per CLAUDE.md Verification block)
bunx @typescript/native-preview --noEmit -p tsconfig.json

# Focused unit + integration
bun test src/server/claude-pty/
bun test src/shared/pty-instance
bun test src/client/stores/ptyInstancesStore

# Broader regression once focused passes
bun test

# End-to-end live verification (CLAUDE.md mandate)
bun run dev &
curl -s localhost:3210/health   # natsDaemon + natsConnection + runner healthy
# then browser-harness drive (screenshot per turn, read console + server stdout)

# Diff hygiene
git diff --check
```

## Acceptance Evidence

To be filled after verification:

- [ ] `bunx @typescript/native-preview` clean.
- [ ] `bun test src/server/claude-pty/` — all PASS, sandbox tests
      omitted (out of scope).
- [ ] `bun test src/shared/pty-instance src/client/stores/ptyInstancesStore` — PASS.
- [ ] `bun test` — no new red, no flakies.
- [ ] `curl /health` shows `natsDaemon`, `natsConnection`, `runner` healthy
      AFTER PTY provider registered.
- [ ] Browser-harness screenshot of `claude-pty` turn reaching transcript
      render attached in `implementation-notes.html`.
- [ ] Browser console log + server stdout slice for same turn agree —
      no orphan errors, no JSONL parse warnings.
- [ ] Crash-reap log line on second boot confirms orphan claude was
      SIGKILLed and runtime dir removed.
- [ ] `git diff --check` clean.
- [ ] `c3x check` clean.
- [ ] `scripts/harness story update port-claude-pty-provider --status implemented`
      executed; row in `docs/TEST_MATRIX.md` final.
- [ ] `scripts/harness trace` entry recorded with verification command output.

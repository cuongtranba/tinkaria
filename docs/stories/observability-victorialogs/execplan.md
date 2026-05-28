# Exec Plan

## Goal

Collect backend + frontend logs into a local, queryable VictoriaLogs instance so
the runner timeout (and future issues) can be diagnosed from durable, correlated
logs instead of terminal scrollback.

## Scope

In scope:

- VictoriaLogs via Docker, bound to `127.0.0.1:9428` (`ops/victorialogs/`).
- Backend `console.*` tee → VL jsonline (`src/shared/log-sink.ts`), installed in
  `cli.ts` (server) and `runner.ts` (runner), opt-in via `VICTORIALOGS_URL`.
- Frontend shipper (`src/client/lib/log-shipper.ts`) → `POST /api/logs` →
  forwarder (`src/server/client-log-forwarder.ts`) → VL.
- Docs + harness records.

Out of scope:

- Remote-runner log shipping (VL localhost-only) — backlog.
- Redaction of secrets in logs — backlog.
- Auto-starting VL (operator runs `docker compose up`).

## Risk Classification

Risk flags:

- External systems (new VictoriaLogs service)
- Public contracts (`POST /api/logs`)
- Cross-platform (frontend + backend)
- Multi-domain
- Existing behavior (console patched)
- Audit/security (logs hold chat content / tokens)

Hard gates:

- External provider (VictoriaLogs)
- Audit/security → mitigated by localhost-only bind + 7d retention

## Work Phases

1. Discovery — confirm Docker/brew, no existing log infra. ✓
2. Design — localhost VL; backend tee; frontend → /api/logs proxy. ✓
3. Validation planning — pure-unit + live VL ingest/query + browser E2E. ✓
4. Implementation — sink, shipper, forwarder, endpoint, wiring, compose. ✓
5. Verification — VL ingest + query proven for server/runner/browser. ✓
6. Harness update — decision 0012, story, matrix, trace, backlog. ✓

## Stop Conditions

Pause for human confirmation if:

- VictoriaLogs would need to be exposed beyond localhost.
- Restarting the live instance requires flags we cannot confirm (→ hand the
  exact command to the operator instead of guessing). **Hit:** the live process
  was already down, so the restart command is handed to the operator.

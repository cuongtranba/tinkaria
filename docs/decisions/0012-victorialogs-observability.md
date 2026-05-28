# 0012 VictoriaLogs observability for backend + frontend

Date: 2026-05-27

## Status

Accepted

## Context

Troubleshooting the runner turn-dispatch timeout was blocked because the server
and runner log to terminals (not files), and the browser console is not captured
anywhere. There was no way to correlate backend and frontend logs after the fact.
We need durable, queryable log collection from both ends for ongoing diagnosis.

## Decision

Run **VictoriaLogs** (single-node, Docker) as a local log store, bound to
`127.0.0.1:9428` only. Ship logs from:

- **Backend** — a `console.*` tee (`src/shared/log-sink.ts`) installed in the
  server (`cli.ts`) and runner (`runner.ts`) entrypoints, POSTing batched
  jsonline records to VictoriaLogs. Opt-in via `VICTORIALOGS_URL`; no-op when
  unset (default runs unchanged).
- **Frontend** — a browser shipper (`src/client/lib/log-shipper.ts`) that
  captures `console.*` + `window.onerror` + unhandledrejection and POSTs to a
  new same-origin endpoint `POST /api/logs`, which forwards to VictoriaLogs
  (`src/server/client-log-forwarder.ts`). The browser never reaches VL directly.

Records are tagged with stream fields `source` (`backend`/`frontend`) and
`component` (`server`/`runner`/`browser`).

## Alternatives Considered

1. **Redirect stdout to files + tail with a collector (vector/fluent-bit).**
   Fewer code changes but adds a collector process and config, and still doesn't
   capture the browser. Rejected for this scope; file redirect remains the quick
   one-off fallback.
2. **Expose VictoriaLogs on the tailnet so the browser/remote runner ship
   directly.** Rejected — VL would hold chat content and tokens; exposing it
   widens the blast radius. Localhost-only + server-side forward is safer.
3. **A hosted log service (Loki/Datadog/etc.).** Overkill for local debugging
   and sends sensitive logs off-box.

## Consequences

Positive:

- One queryable place (LogsQL + built-in vmui) for server, runner, and browser
  logs, correlated by time and `source`/`component`.
- Zero impact when disabled; shipping is fire-and-forget and never blocks or
  crashes the host process.

Tradeoffs:

- `console.*` is monkeypatched in-process (guarded, reversible). Acceptable for
  an observability shim.
- VictoriaLogs stores potentially sensitive data → **must stay localhost-only**;
  never expose via `tailscale serve`. Retention capped at 7 days.
- A **remote** runner can't reach a localhost VL, so remote-runner logs are not
  captured in V1 (see follow-up).

## Follow-Up

- Ship **remote-runner** logs over the existing NATS connection to a server
  subject that forwards to VL (keeps VL localhost-only). Tracked in
  `docs/HARNESS_BACKLOG.md`.
- Consider narrowing what gets shipped (redaction of tokens) before any
  multi-user exposure.

# Design

## Domain Model

No domain entities. A **log record** shipped to VictoriaLogs has VL's default
fields `_time` (RFC3339) and `_msg`, plus tags: `level`, `source`
(`backend`/`frontend`), `component` (`server`/`runner`/`browser`), and origin
metadata (`host`/`pid` for backend, `url` for frontend). `source` + `component`
are configured as VL **stream fields**.

## Application Flow

- Backend: `installConsoleTee(env, component)` wraps `console.{debug,info,log,
  warn,error}` to enqueue a `LogLine` into a batching `createLogShipper`, which
  POSTs ndjson to `${VICTORIALOGS_URL}/insert/jsonline?_stream_fields=source,component`
  every 2s (or at 500 records). Original console output is preserved.
- Frontend: `installClientLogShipper()` wraps console + `window.onerror` +
  unhandledrejection, batches `ClientLogRecord`s, and POSTs to `/api/logs` every
  3s and on `pagehide`/`visibilitychange` (sendBeacon).
- Server: `POST /api/logs` → `forwardClientLogs` sanitizes (cap 1000 records,
  truncate msg 8KB, validate level/ts) and forwards to VL as `source=frontend`.

## Interface Contract

- `POST /api/logs` — body `{ logs: Array<{ level, msg, ts, url }> }`. Always
  returns `204` (logging must never error for the client), even on bad JSON,
  VL down, or `VICTORIALOGS_URL` unset.
- Env: `VICTORIALOGS_URL` (e.g. `http://127.0.0.1:9428`). Unset ⇒ all shipping is
  a no-op.

## Data Model

VictoriaLogs storage at the container volume `victoria-logs-data`,
`-retentionPeriod=7d`. No app schema/migration. No tinkaria DB changes.

## UI / Platform Impact

No visible UI. `src/main.tsx` installs the client shipper before render. Backend
entrypoints install the tee first thing. Docker required to run VL.

## Observability

This *is* the observability layer. Self-guard: shipping is fire-and-forget and
all network/serialization errors are swallowed so a logging failure can never
crash or block the server, runner, or browser.

## Alternatives Considered

1. File redirect + collector (vector/fluent-bit) — simpler infra but no browser
   capture; kept as the quick one-off fallback.
2. Expose VL on the tailnet for direct browser/remote-runner shipping — rejected
   (sensitive data; widened exposure).

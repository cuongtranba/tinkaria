# Overview

## Current Behavior

The server and runner log to stdout (terminals, not files); the browser console
is not captured anywhere. Diagnosing issues like the runner turn-dispatch
timeout requires reading ephemeral terminal scrollback, and backend/frontend
logs cannot be correlated after the fact.

## Target Behavior

Backend (server + local runner) and frontend (browser) logs are collected into a
local VictoriaLogs instance and queryable via LogsQL / the built-in vmui, tagged
by `source` (backend/frontend) and `component` (server/runner/browser). Shipping
is opt-in (`VICTORIALOGS_URL`) and never affects the app when disabled or when VL
is down.

## Affected Users

- Operator / developer troubleshooting the live instance (the user).

## Affected Product Docs

- `docs/decisions/0012-victorialogs-observability.md`
- `ops/victorialogs/README.md`

## Non-Goals

- Remote-runner log capture (VL is localhost-only; follow-up via NATS).
- Token/PII redaction before shipping (follow-up).
- Metrics/traces — logs only.
- Production multi-user exposure of VictoriaLogs.

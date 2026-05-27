# US-NATSPORT Pin the embedded NATS port across restarts

## Status

implemented

## Lane

normal

## Product Contract

When `NATS_PORT` is set, the embedded NATS daemon binds that fixed TCP port on
every boot. A paired runner's stored credential (`nats://host:port`) therefore
stays valid across server restarts — no re-pairing. When `NATS_PORT` is unset,
the daemon picks an ephemeral port as before (no behavior change).

## Relevant Product Docs

- `docs/HARNESS_BACKLOG.md` (backlog #7 — closed by this story)
- `src/nats/nats-daemon-callout.ts` (already honors `NATS_PORT`)

## Acceptance Criteria

- With `NATS_PORT=<fixed>`, the daemon's advertised URL uses that port, and the
  same port after a restart (credential survives).
- With `NATS_PORT` unset, the port is ephemeral (unchanged default).
- No other stripped NATS env vars (`NATS_URL`/`NATS_MODE`/`NATS_WS_PORT`/...) leak
  to the daemon child.

## Design Notes

- Root cause: `nats-daemon-manager.ts` destructured `NATS_PORT` out of the env
  (`_natsPort`) and never re-added it, so the daemon child never saw it and always
  fell back to ephemeral (`NATS_PORT ? Number : -1` in nats-daemon-callout.ts).
- Fix: rename `_natsPort` → `natsPort` and re-add `...(natsPort ? { NATS_PORT } : {})`
  to the child env — same opt-in pattern as `NATS_DATA_DIR`. Other env vars stay
  stripped (intentional isolation).
- Operator usage: add `NATS_PORT=4222` (or any free port) to the start command.
  The port must be reachable by remote runners over the tailnet.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | n/a (env→spawn wiring; proven via live boot) |
| Integration | dev boot NATS_PORT=14222 → nats://…:14222; restart → :14222 again (identical); unset → ephemeral :59244 |
| E2E | (operator) pair a runner, restart server, runner stays connected without re-pair |
| Platform | embedded NATS daemon child honors NATS_PORT |

## Harness Delta

- Intake #20; closes backlog #7.

## Evidence

- typecheck exit 0.
- Live: boot1 `nats://127.0.0.1:14222`; restart `nats://127.0.0.1:14222` (survived);
  control with NATS_PORT unset `nats://127.0.0.1:59244` (ephemeral, unchanged default).

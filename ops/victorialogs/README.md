# VictoriaLogs observability (decision 0012)

Local log collection for tinkaria — backend (server + local runner) and frontend
(browser) logs in one queryable place, for troubleshooting.

## Architecture

```
browser console/errors ──POST /api/logs──▶ Bun server ──┐
                                                         ├──▶ VictoriaLogs (127.0.0.1:9428)
backend console.* (server, local runner) ──jsonline─────┘
```

- `source=backend` (`component=server|runner`) and `source=frontend`
  (`component=browser`) are stream fields, so you can filter by origin.
- VictoriaLogs is **localhost-only**. The browser never reaches it directly; the
  server forwards browser logs via `/api/logs`. Do not expose `:9428` on the
  tailnet — logs may contain chat content and tokens.

## Run

```bash
# 1. Start VictoriaLogs
docker compose -f ops/victorialogs/docker-compose.yml up -d

# 2. Start tinkaria with shipping enabled (preserve your usual flags/env)
VICTORIALOGS_URL=http://127.0.0.1:9428 NATS_ADVERTISED_HOST=<host> <your start cmd>

# 3. Query: open the built-in UI
open http://127.0.0.1:9428/select/vmui
```

When `VICTORIALOGS_URL` is unset, all shipping is a no-op (default behavior).

## Example queries (LogsQL, in the vmui)

```
source:backend component:runner level:error      # runner errors
source:backend _msg:~"timeout"                    # the start_turn timeout
source:frontend level:error                       # browser errors
_time:5m                                           # everything in the last 5 min
```

## Notes / limits

- A **remote** runner can only ship if it can reach `VICTORIALOGS_URL`. Since VL
  is localhost-only on the server machine, remote-runner logs are not captured in
  V1 — redirect that runner's stdout to a file on its own box, or see the backlog
  item about shipping remote-runner logs over NATS.
- Retention is 7 days (`-retentionPeriod=7d`); adjust in `docker-compose.yml`.

# Validation

## Proof Strategy

Pure logic is unit-tested; the live pipeline (ingest → query) is proven against a
real VictoriaLogs container for all three sources (server, runner, browser),
including a real-browser auto-capture via browser-harness.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | log-sink: toLogLine / serializeBatch / shipper POST + error-swallow / installConsoleTee no-op-when-unset + tee-preserves-original. client log-shipper: formatClientLog. client-log-forwarder: sanitize (drop/clamp/cap/truncate) / buildNdjson / forward (ship vs no-url vs error-swallow). |
| Integration | `POST /api/logs` → 204 → record visible in VL as `source=frontend component=browser`. Backend tee: dev server + runner console lines visible as `source=backend component=server\|runner`. |
| E2E | browser-harness: real `console.warn` on the live-built client auto-captured → VL (`source=frontend`, msg + object marker intact). |
| Platform | Docker container bound to `127.0.0.1:9428` only; VL `/health` OK; `/insert/jsonline` + `/select/logsql/query` round-trip. |
| Performance | Batched (2s backend / 3s frontend), capped (500 / 1000 records); fire-and-forget — no app back-pressure. |
| Logs/Audit | VL localhost-only; 7d retention; not exposed via tailscale serve. |

## Fixtures

- VictoriaLogs `victoriametrics/victoria-logs:v1.0.0-victorialogs` on `:9428`.
- Dev-profile server boot with `VICTORIALOGS_URL=http://127.0.0.1:9428`.

## Commands

```text
bunx @typescript/native-preview --noEmit -p tsconfig.json        # exit 0
bun test src/shared/log-sink.test.ts \
         src/client/lib/log-shipper.test.ts \
         src/server/client-log-forwarder.test.ts                  # 23 pass / 0 fail
docker compose -f ops/victorialogs/docker-compose.yml up -d
# query proof:
curl -G http://127.0.0.1:9428/select/logsql/query --data-urlencode 'query=source:frontend'
```

## Acceptance Evidence

- Direct ingest + query-back: record returned with stream `{component="server",source="backend"}`.
- `/api/logs` → 204; `source=frontend component=browser` record queryable.
- Dev server + shared runner logs queryable as `source=backend` (`server` and
  `runner` components) — including the runner's "connected to NATS / Probed
  capabilities / ready" lines relevant to the timeout.
- browser-harness: `console.warn('OBS-E2E …')` round-tripped to VL.
- Unit: 23 pass / 0 fail; typecheck clean.

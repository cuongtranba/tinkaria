# Validation

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | runner-pair.test.ts: natsWsProxyUrl derived as `ws://host:port/nats-ws`. runner-nats/credential tests green. |
| Integration | Local dev boot: pair runner → credential has natsWsProxyUrl; runner connects via wsconnect; /connz shows it as cid ip=127.0.0.1 lang=nats.ws with all 5 cmd subs registered. |
| E2E | Operator: re-pair the remote runner, send a turn → completes (no `start_turn` timeout). Confirm via VL + /connz the runner is now a 127.0.0.1 nats.ws connection. ← pending operator |
| Platform | Bun runner uses global WebSocket via wsconnect. |

## Acceptance Evidence

- typecheck exit 0; runner-pair + runner-nats + runner-credential tests pass (24+3).
- Local /connz: WS-paired runner connected through proxy (127.0.0.1, nats.ws), cmd subs registered.
- Remote turn-completes: TBD by operator.

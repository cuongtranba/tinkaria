# Design

## Application Flow

- `runner-pair.ts`: after exchange, derive `natsWsProxyUrl` from `serverUrl`
  (`https://h` → `wss://h/nats-ws`, `http://h:p` → `ws://h:p/nats-ws`) and store it
  in the credential.
- `runner.ts`: when loading the credential, prefer `cred.natsWsProxyUrl` over
  `cred.natsUrl` (raw TCP) as the connection URL. Env-driven (server-spawned local)
  runners keep using `NATS_URL` (TCP, loopback — fine).
- `runner-nats.ts connectRunner`: `ws://`/`wss://` URL → `wsconnect` (@nats-io/nats-core,
  Bun global WebSocket); else TCP `connect` (@nats-io/transport-node). Both return a
  `NatsConnection` compatible with Kvm + JetStream.

## Interface Contract

- `RunnerCredential.natsWsProxyUrl?: string` (optional; older creds lack it → TCP fallback).
- No change to `POST /api/pairing/exchange`.

## Why this fixes it

The runner's NATS connection now terminates at the server's local `/nats-ws` proxy
(127.0.0.1) which forwards to the embedded NATS on loopback — same as the browser.
Server→runner delivery is then local; the tailnet hop is carried by the tunneled
HTTP (3210), which is reliable, instead of a raw direct :4222 socket whose
server→client direction silently fails for async pushes.

## Alternatives Considered

1. Tunnel :4222 via tailscale (config-only) — keeps a second port; less aligned with
   "everything through 3210".
2. Keep raw TCP, tune NATS write_deadline — doesn't address the direct-path delivery.

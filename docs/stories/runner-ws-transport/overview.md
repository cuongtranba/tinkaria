# Overview

## Current Behavior

A paired (remote) runner connects to NATS over raw TCP at the advertised host:port
(e.g. `nats://mac-mini.tailbda4c.ts.net:4222`). Over the tailnet, this direct
connection establishes and the runner can publish (heartbeat → "online") and do
JetStream request/reply (KV register, _INBOX acks) — but **server-initiated pushes**
(`start_turn` to the runner's command subject) are not delivered, so every turn
times out. The browser, by contrast, reaches NATS via the server's `/nats-ws`
proxy over the single tunneled HTTP port (3210) and works.

## Target Behavior

The runner connects to NATS via the **same `/nats-ws` proxy as the browser**, over
the tunneled HTTP port — `wss://<host>/nats-ws` — instead of the raw NATS TCP port.
Its connection terminates at the server-local proxy (appears as 127.0.0.1 to NATS),
so server→runner delivery is local and reliable. Turns complete.

## Affected Users

- Operators running a remote runner over a tailscale tunnel (the user).

## Non-Goals

- Removing the raw TCP path (kept as fallback for older credentials / local runners).
- Changing the server pairing response (the runner derives the proxy URL itself).

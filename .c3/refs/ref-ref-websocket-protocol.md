---
id: ref-ref-websocket-protocol
c3-seal: 0384e8b41f9ccced1a817ac5cb1ec57a5f00d2535afed774497ee8776b4a1391
title: websocket-protocol
type: ref
goal: 'Document the NATS WebSocket protocol for Tinkaria: /nats-ws routing, typed live subscriptions, reconnect/backfill behavior, and single-connection client/server streaming.'
---

## Goal

Document the NATS WebSocket protocol for Tinkaria: /nats-ws routing, typed live subscriptions, reconnect/backfill behavior, and single-connection client/server streaming.

## Choice

Single NATS WebSocket connection routed through the Bun HTTP server at `/nats-ws`. The client always connects to `ws://<host>/nats-ws`; the server proxies via `Bun.serve<NatsWsData>` to the internal NATS WS port. In dev mode, Vite proxies `/nats-ws` to the backend. Topics include: sidebar, chat, terminal, keybindings, update, local-projects. Messages carry a topic field for routing and typed payloads for each subscription channel.

## Why

- Single connection avoids overhead of multiple WS connections or HTTP polling
- Path-based routing (`/nats-ws`) avoids exposing the NATS WS port externally and works uniformly in dev (Vite proxy), production, browser, and PWA contexts
- Topic-based routing keeps concerns separated without separate endpoints
- Typed message protocol provides compile-time safety on both client and server
- Subscriptions allow clients to opt into only the data streams they need
- Efficient for high-frequency updates (terminal output, chat streaming)

## How

Use the shared socket/NATS protocol boundary for every live client/server stream and command.

Implementation contract:

- Browser code connects through `/nats-ws`; never expose or hard-code the internal NATS WebSocket port.
- Subjects and stream names come from shared constants, not string literals in features.
- Each subscription must define snapshot shape, event shape, and reconnect/backfill behavior.
- Client commands must be declared in `ClientCommand`, registered by server responders, and covered by request/reply tests.
- `chat.send` starts immediate turns; `chat.queue` accepts follow-up turns for existing chats and delegates durable execution ownership to the server.
- Server-side proxy and responders must log failures with the shared prefix and preserve auth/lazy-open ordering.
- Tests must cover subscription shape, reconnect or fallback behavior, and typed payload handling for new channels/commands.

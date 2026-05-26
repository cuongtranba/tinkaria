---
id: adr-20260403-nats-ws-path-proxy
c3-seal: 59cf45d9c76dec73cbfd496780af1ab219404af177dd24fea8978d147a464b3e
title: nats-ws-path-proxy
type: adr
goal: Route NATS WebSocket through Bun server at /nats-ws path instead of exposing a random NATS WS port directly.
status: proposed
date: "2026-04-03"
---

## Goal

Route NATS WebSocket through Bun server at /nats-ws path instead of exposing a random NATS WS port directly.

- **Before**: Client fetched /health to get natsWsPort, then connected to ws://host:natsWsPort
- **After**: Client connects to ws://host/nats-ws; Bun.serve proxies to internal NATS WS port
Changes applied:

1. server.ts — added NatsWsData type, /nats-ws upgrade handler, websocket proxy section
2. nats-socket.ts — removed /health fetch, derives URL as window.location.host/nats-ws
3. vite.config.ts — added /nats-ws proxy with ws:true
Benefit: no random port exposure, works identically in dev (Vite proxy), production, and Tauri companion.

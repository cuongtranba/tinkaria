---
id: adr-20260410-ref-nats-transport-hardening-adoption
c3-seal: 6f4a132b615023120ef55d40e64204ad89582cc1fbc9b6cdd974d7ca9e7f2405
title: Adopt ref-nats-transport-hardening as the NATS transport standard
type: adr
goal: Adopt `ref-nats-transport-hardening` as the standard every NATS-connecting actor in this codebase must honor. The ref captures the eight disciplines that landed in `adr-20260410-nats-reliability-sweep` and makes them a first-class pattern rather than tribal knowledge buried in the diff.
status: implemented
date: "2026-04-10"
---

## Goal

Adopt `ref-nats-transport-hardening` as the standard every NATS-connecting actor in this codebase must honor. The ref captures the eight disciplines that landed in `adr-20260410-nats-reliability-sweep` and makes them a first-class pattern rather than tribal knowledge buried in the diff.

## Context

The hardening ADR fixed four P0 bugs in the NATS WebSocket transport (upstream race in the `/nats-ws` proxy, double-open race in the client, orphaning `resetConnection`, single-loop `monitorStatus` invariant) plus the runner's missing reconnect config. Each fix codified a discipline that had been silently violated. Without documenting those disciplines as a ref, a future refactor would inevitably reintroduce the same bugs (the ADR's sweep found that some of these patterns had already been relaxed once before).

## Disciplines captured

1. Upstream readiness guard before `WebSocket.send()`
2. Bounded buffer with oldest-drop policy on overflow
3. Single-attempt discovery (no `Promise.race` probes)
4. Explicit `await nc.close()` before nulling on reset
5. `monitorStatus` captures locals and exits on connection swap
6. Shared reconnect options across every actor
7. Observable proxy counters flushed per minute with reset + idle gate
8. Drain-with-timeout, fall back to close, on shutdown
Each discipline is stated with a concrete "Why" grounded in observed runtime constraints: Cloudflare tunnel handshake variance (1.3–4s, measured 1964ms in prod), Bun WebSocket's WHATWG-spec throw on CONNECTING send, NATS library internal reconnect racing outer loops, and the diagnostic blindness that made the original bug invisible until users noticed.

## Citing components

Wired via `c3x wire`:

- `c3-203` cli (owns `src/server/server.ts` `/nats-ws` proxy and counter flush)
- `c3-110` chat (owns `src/client/app/nats-socket.ts`)
- `c3-205` nats-transport (owns `src/server/nats-bridge.ts`, `nats-connector.ts`)
- `c3-208` kit-runtime (nearest owner for `src/runner/runner-nats.ts` + `runner.ts` until a dedicated runner component exists)

## Override policy

Overrides require an ADR naming the specific discipline, the failure mode being accepted, and a bounded blast radius. Documented explicitly in the ref's `## Override` section.

## Status

Implemented. The ref is active and all four citing components are wired. Compliance gate (three YES/NO questions) is in the ref's `## How` section and can be invoked in code review.

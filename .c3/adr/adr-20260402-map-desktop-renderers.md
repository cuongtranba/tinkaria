---
id: adr-20260402-map-desktop-renderers
c3-seal: ee43d398e3b4bb8d53b3dcacbd5edd2d8a3e23266cb5bc0aee8f88721dc805ac
title: map-desktop-renderers
type: adr
goal: Map src/server/desktop-renderers.ts and its test into c3-205 nats-transport codemap. File was added by Codex to support the desktop-renderers NATS subscription topic but remained uncharted. Used by nats-publisher.ts (getSnapshot) and nats-responders.ts (register/unregister commands).
status: proposed
date: "2026-04-02"
---

# map-desktop-renderers

## Goal

Map src/server/desktop-renderers.ts and its test into c3-205 nats-transport codemap. File was added by Codex to support the desktop-renderers NATS subscription topic but remained uncharted. Used by nats-publisher.ts (getSnapshot) and nats-responders.ts (register/unregister commands).

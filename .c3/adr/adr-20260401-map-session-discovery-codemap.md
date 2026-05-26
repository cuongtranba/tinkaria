---
id: adr-20260401-map-session-discovery-codemap
c3-seal: 725f009e89f989c3039953be321674d98a9312fcedec61ae6c053734a4d9221f
title: Map Session Discovery Codemap
type: adr
goal: Map `src/server/session-discovery.ts` to an owning C3 component so session discovery, resume, and transcript import flow can be traced through C3 without falling back to rule-only lookup results.
status: implemented
date: "2026-04-01"
affects:
    - c3-205
    - c3-213
    - c3-217
---

## Goal

Map `src/server/session-discovery.ts` to an owning C3 component so session discovery, resume, and transcript import flow can be traced through C3 without falling back to rule-only lookup results.

## Work Breakdown

- Add a dedicated server component for session discovery and transcript import.
- Attach `src/server/session-discovery.ts` to that component through the codemap.
- Update adjacent component docs to show that NATS transport depends on the session-discovery layer for `sessions` snapshots and resume/import support.

## Risks

- Folding this file into `c3-213 discovery` would blur project discovery with session discovery/import responsibilities.
- Leaving it unmapped preserves 100% coverage numerically but weakens architectural traceability for session-management work.

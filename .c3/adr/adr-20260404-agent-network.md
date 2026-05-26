---
id: adr-20260404-agent-network
c3-seal: 8ed76440209d2f1c1fe04f31dff687e21561aeaaf6b29ffc200bdf76e5520a42
title: agent-network
type: adr
goal: 'Add cross-session awareness via 4 server components: session-index, task-ledger, transcript-search, project-agent. ResourceRegistry removed after triage (premature distributed primitives, zero data path). Adds HTTP routes, CLI binary, and wires into existing EventStore message pipeline.'
status: accepted
date: "2026-04-04"
---

# agent-network

## Goal

Add cross-session awareness via 4 server components: session-index, task-ledger, transcript-search, project-agent. ResourceRegistry removed after triage (premature distributed primitives, zero data path). Adds HTTP routes, CLI binary, and wires into existing EventStore message pipeline.

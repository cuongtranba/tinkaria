---
id: ref-mcp-app-jtbd
c3-seal: 4ca5e7bb276ffc18e4bd97f80999b853e69d3a6b3b866d81828d3ae9992d0605
title: mcp-app-jtbd
type: ref
goal: Define MCP Apps adoption around important user jobs rather than infrastructure novelty. The feature is only complete when users can finish the intended job correctly, safely, and without avoidable friction.
---

## Goal

Define MCP Apps adoption around important user jobs rather than infrastructure novelty. The feature is only complete when users can finish the intended job correctly, safely, and without avoidable friction.

## Choice

Prioritize only the high-value C3 jobs for Phase 1 and Phase 2. Treat advanced controls, multi-pane app choreography, richer previews, and delight as later slices after the core jobs are complete and verifiable.

## Why

MCP Apps can easily drift into a host/runtime project with weak user value. Tinkaria should instead ask what the user is hiring the feature to do, then provision only the minimum app capabilities needed to finish that job. This keeps scope honest and prevents infrastructure-first work from outrunning user value.

## How

The initial important jobs are:

1. Understand a project's architecture quickly: open a project and get a trustworthy C3 overview/topology without manual CLI spelunking.
2. Answer impact and ownership questions: inspect what a component owns, what uses it, and what might break if it changes.
3. Continue from overview to action safely: move from project overview into chat or transcript context with the same architectural state, but without letting the app itself execute privileged runtime actions.
Phase 1 is done only if those jobs are completed with these boundaries:

- read-only app behavior
- first-party or strict allowlisted origins only
- lightweight project summaries; lazy detail/session hydration
- deterministic fallback to `present_content` when interactive rendering is unavailable
- one canonical app-session identity model

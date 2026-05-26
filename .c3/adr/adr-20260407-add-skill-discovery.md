---
id: adr-20260407-add-skill-discovery
c3-seal: 27614675eb0a25ba69bb0e8a63160b419146b9017478d9b5b370a5aef73d42fe
title: add-skill-discovery
type: adr
goal: Add server-side skill discovery module that scans filesystem skill directories (~/.claude/skills/ and <project>/.claude/skills/) and injects discovered skills into Codex system_init entries. This enables the skill ribbon to work for both Claude and Codex providers.
status: implemented
date: "2026-04-07"
---

## Goal

Add server-side skill discovery module that scans filesystem skill directories (~/.claude/skills/ and <project>/.claude/skills/) and injects discovered skills into Codex system_init entries. This enables the skill ribbon to work for both Claude and Codex providers.

## Work Breakdown

- NEW: src/server/skill-discovery.ts — scanSkillDirs() + SkillCache class with TTL-based caching
- NEW: src/server/skill-discovery.test.ts — 11 tests covering scan, merge, dedup, ENOENT, cache TTL
- MODIFY: src/server/codex-app-server.ts — codexSystemInitEntry(model, skills?) accepts skills param
- MODIFY: src/server/agent.ts — AgentCoordinator receives SkillCache, resolves skills before Codex turns
- MODIFY: src/server/local-codex-kit.ts — StartKitTurnRequest threads skills through NATS
- MODIFY: src/server/server.ts — creates SkillCache instance, passes to AgentCoordinator

## Risks

- Skill directories might not exist for all users → handled via ENOENT graceful fallback
- Cache staleness → 30s TTL provides reasonable freshness without excessive I/O

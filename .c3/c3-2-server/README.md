---
id: c3-2
c3-seal: fd5abe31631c91b81788fea895cfe6f0be0bbfd169e15e5e865490045f1a101d
title: server
type: container
boundary: service
parent: c3-0
goal: Bun HTTP + WebSocket server managing all persistent state, AI agent sessions, terminal processes, and real-time client communication.
---

## Goal

Bun HTTP + WebSocket server managing all persistent state, AI agent sessions, terminal processes, and real-time client communication.

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-201 | event-store | Foundation | active | JSONL event sourcing, snapshots, and replay state. |
| c3-203 | cli | Foundation | active | Server entry point, process startup, and operational commands. |
| c3-204 | shared-types | Foundation | active | Shared protocol, schemas, tool contracts, render utilities, and transcript projection-key types. |
| c3-205 | nats-transport | Foundation | active | NATS/WebSocket transport, JetStream message delivery, and projection-key-preserving transcript payload transport. |
| c3-206 | orchestration | Foundation | active | Session orchestration and provider runtime coordination. |
| c3-207 | prompt-context | Foundation | active | Prompt assembly, developer instructions, and context surfaces. |
| c3-208 | kit-runtime | Foundation | active | Local kit process/runtime boundary and lifecycle. |
| c3-209 | coordination | Foundation | active | Cross-session coordination and shared task state. |
| c3-210 | agent | Feature | active | Multi-turn AI session management and turn execution. |
| c3-211 | providers | Feature | active | Provider/model catalog and provider-specific capabilities. |
| c3-213 | discovery | Feature | active | Local project scanning and workspace discovery. |
| c3-214 | read-models | Feature | active | CQRS derived views, transcript render-unit projections, and projection-key derivation for client state. |
| c3-215 | share | Feature | active | Tunnel and QR sharing behavior. |
| c3-216 | codex | Feature | active | Codex CLI integration and Codex app-server protocol. |
| c3-217 | session-discovery | Feature | active | External provider session discovery and resume data. |
| c3-218 | session-index | Feature | active | Session indexing, naming, unread state, and ordering. |
| c3-219 | task-ledger | Feature | active | Durable task/todo ledger behavior for project work. |
| c3-220 | transcript-search | Feature | active | Transcript search, retrieval, and matching surfaces. |
| c3-222 | project-agent | Feature | active | Workspace/project agent operations and automation. |
| c3-223 | skill-discovery | Feature | active | Skill inventory, discovery, and prompt integration. |
| c3-224 | journey-verification | Feature | active | End-to-end journey verification contracts and harnesses. |
| c3-225 | sandbox | Feature | active | Sandbox lifecycle, health, and isolation surfaces. |
| c3-226 | transcript-runtime | Feature | active | Live transcript runtime bridge, append-only render facts, and event consumption. |
| c3-227 | extension-router | Feature | active | Server routing for project extension data. |
| c3-228 | claude-pty | Feature | active | Claude CLI run inside a PTY as additive subscription-billed provider. |

## Responsibilities

- Persist all state via JSONL event logs with snapshot compaction
- Route WebSocket messages and manage topic-based subscriptions
- Coordinate multi-turn AI sessions (Claude SDK + Codex CLI)
- Spawn and manage PTY terminals
- Scan local filesystem for Claude/Codex projects
- Serve static SPA assets in production

## Complexity Assessment

Complex: Event sourcing with replay, multi-provider agent orchestration, subprocess management (CLI + PTY), CQRS read model derivation, real-time WebSocket broadcasting.

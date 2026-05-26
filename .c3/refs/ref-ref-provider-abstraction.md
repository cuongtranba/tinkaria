---
id: ref-ref-provider-abstraction
c3-seal: 5e416b09364c458136eb2ee3312c452d17f53c0b10d1d9da6465d195a303fe9b
title: ref-provider-abstraction
type: ref
goal: Abstract away differences between AI providers so the UI and business logic work identically regardless of which provider is active.
---

## Goal

Abstract away differences between AI providers so the UI and business logic work identically regardless of which provider is active.

## Choice

ProviderCatalog defines a normalized interface over Claude and Codex providers. Each provider exposes its models, capabilities, and reasoning effort levels through a shared contract. Model options (thinking budget, output tokens, reasoning effort) are mapped to provider-specific parameters behind the abstraction.

## Why

- Swap or add providers without touching UI code
- Normalized reasoning effort levels (low/medium/high) map to provider-specific parameters
- Shared model option types enable a single settings UI for all providers
- Provider-specific quirks are isolated in adapter code, not leaked across the codebase
- Easy to add new providers by implementing the catalog interface

## How

Provider-specific bootstrap and transport live behind dedicated harness seams that preserve a shared `HarnessTurn` contract.

For each provider:

1. Put provider-owned startup choreography in `src/server/<provider>-harness.ts`.
2. Expose a single `start<Provider>Turn()` entrypoint that accepts shared coordinator inputs and returns `HarnessTurn`.
3. Keep `AgentCoordinator` limited to prompt shaping, lifecycle bookkeeping, and the single harness call.
4. Add focused harness tests that prove provider-owned bootstrap, fallback, and startup-failure behavior directly.
Compliance questions:

- Can the coordinator start the provider without directly calling the provider SDK or transport primitives?
- Does the provider have a dedicated harness module that owns bootstrap/session-start choreography?
- Are provider transport semantics verified in focused harness tests instead of only broad coordinator tests?

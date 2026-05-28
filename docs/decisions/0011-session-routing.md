# 0011 — Session Routing (multi-runner selection)

- **Status:** accepted
- **Date:** 2026-05-27
- **Epic:** Personal Runners PR5 (concept decision #3)
- **Stacks on:** 0009 (registration/liveness), 0010 (command profile split)

## Context

After PR1–PR4 the server still assumes **one** runner: `RunnerManager.ensureRunner()`
spawns or discovers exactly one, and `RunnerProxy` bakes that single `runnerId`
into every command subject. The KV registry already holds every runner (with PR3
liveness + PR4 capabilities), but nothing enumerates or chooses among them. The
concept (#3) calls for routing each session to the right runner: a sticky default,
a picker when ambiguous, fail-fast when none, and a shared-runner fallback.

## Decision

1. **Lane up to high-risk.** The change-request pre-triaged PR5 *normal*; we treat
   it as **high-risk** because the realized change rewires the turn-dispatch
   chokepoint (`RunnerProxy`) from a fixed runnerId to per-session selection — large
   Existing-behavior blast radius across server + client + protocol. No hard gate
   fires, so this is judgment, not forced; when pre-triage and realized blast radius
   disagree, lane up.

2. **Introduce `RunnerRouter`** (server) that enumerates the whole KV registry into
   annotated `RunnerDescriptor`s and runs a deterministic, capability- and
   liveness-aware `select()`. Lifecycle stays in `RunnerManager`; the router only
   reads + chooses.

3. **Sticky pin, persisted on the chat (`chat.runnerId`), not per-turn.** A turn,
   its cancel, its tool responses, and its PTY teardown must all reach the *same*
   machine (the session's claude-pty child / OAuth pool / MCP server live there).
   Select once (first turn or explicit pick), persist, honor for the chat's life,
   and recompute only when the pinned runner stops being eligible.

4. **Selection policy:** sticky-eligible → use it (zero-click); else sole-eligible →
   auto (zero-click); else (≥2 eligible OR sticky-offline) → `needs_pick`; else
   (none eligible) → fail-fast. Liveness + protocol compat are **fail-closed**;
   capability is **fail-open** for pre-PR4 `capabilities===null` (the turn-start
   gate still catches a real mismatch loudly).

5. **Shared-runner fallback is not special-cased** — the server-spawned runner is
   just another `list()` entry (`isShared`). A member with no personal runner finds
   it as the sole eligible candidate.

6. **`/health` surfaces the fleet** (`runners: RunnerDescriptor[]`) alongside the
   existing single `runner`; `ok` logic unchanged (still gated on the shared
   runner so the server stays usable).

## Alternatives considered

- **Per-turn re-selection (no persistence).** Rejected: could strand an in-flight
  session on a different runner; breaks cancel/tool-response affinity.
- **Round-robin / least-busy scheduling.** Deferred: PR5 is sticky-default + pick,
  not a scheduler. No load signal exists yet.
- **Filter by `ownerId` now.** Deferred since PR2 (no user-identity system). The
  field is carried on the descriptor; enforcement lands with identity.
- **Cache `list()`.** Rejected for PR5: selection is only on turn-start and cheap;
  caching risks stale-eligibility (routing to a just-died runner). Revisit if hot.

## Consequences

- `RunnerProxy`'s single-runner behavior must be a **strict superset**: with one
  eligible runner, behavior is bit-identical (proven by the existing
  `runner-proxy.test.ts` staying green unchanged).
- New client surface: `chat.runnerPickRequired` event + `chat.selectRunner`
  command + a picker (zero-click path never shows it).
- GitNexus impact analysis unavailable (index read-only) → tests + dual-signal boot
  + review are the compensating control, per PR1–PR4 precedent.
- Model-level routing and `ownerId` enforcement remain follow-ups.

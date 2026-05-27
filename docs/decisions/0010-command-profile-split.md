# 0010 Command Profile Split — logical intent server-side, binary+secrets runner-side (Personal Runners PR4)

Date: 2026-05-27

## Status

Accepted (design) — implementation in progress on `feat/personal-runners-pr4-profile-split`.

## Context

PR4 (concept #10) makes the runner command carry *logical intent only*. Reconciled
stack (post port-claude) state:
- `StartTurnCommand` carries server-resolved `binaryPath` (`RuntimeRegistry` via
  `runner-proxy.resolveProfileOverrides`) — meaningless on a member's machine —
  and `extraEnv` (profile `env`, non-secret today; `apiKeyRef` is a reference,
  not expanded).
- The runner consumes the server `binaryPath` for Codex + Claude SDK.
- **port-claude already resolves the binary runner-side for the PTY path**
  (`resolve-binary.adapter`; `startClaudePtyTurn` has no `binaryPath`) and handles
  OAuth tokens via a runner-side pool (not env).
- `RunnerRegistration.providers` is hardcoded `["claude","codex"]`.

## Decision

1. **Drop `binaryPath` from `StartTurnCommand`** and remove the server's binary
   resolution. The command = logical intent (provider/model/effort/planMode/
   skills + non-secret `extraEnv`), never a path or secret.
2. **Runner resolves its own binary for all providers**, unifying Codex + Claude
   SDK onto the existing `resolve-binary.adapter` (PTY already uses it) — do not
   fork a second resolver.
3. **`extraEnv` is contractually non-secret.** Document it; add an audit guard.
   Secrets (API keys, OAuth) are resolved **runner-side** (local env + the OAuth
   pool) and never transit the server.
4. **Probe capabilities, don't assume.** The runner probes installed providers
   (+ models via `RuntimeRegistry.probeCapabilities`) and advertises them in
   `RunnerRegistration.capabilities`; the hardcoded providers list is replaced.
5. **Capability turn-start gate**: refuse a turn whose provider/model the single
   active runner lacks, with a clear message (reuse PR3's gate seam). **Routing**
   among multiple capable runners is **PR5**, not PR4 — PR4 refuses, doesn't route
   (concept #10: "refuse with a clear message", never silent downgrade).

## Consequences

- Secrets are structurally prevented from transiting the server — the core
  Personal-Runners security property at the command layer.
- Codex + Claude SDK binary handling changes (server-sent → runner-resolved);
  port-claude's PTY path is the template (already compliant — no `binaryPath`).
- `RunnerRegistration` capabilities become real; PR5 routing will consume them.
- Internal `StartTurnCommand` contract change (field removed) — both ends in this
  repo, no external consumers; no migration (KV ephemeral).

## Deferred

- **Multi-runner routing by capability** (pick a capable runner) — **PR5**.
- A general local **secret vault** beyond the OAuth pool — follow-up.
- `ownerId` — deferred (no user-identity system).

## Verification

No `binaryPath`/secret in the command (audit); runner resolves its own binary per
provider (Codex/Claude SDK/PTY); probed `capabilities` advertised; capability gate
refuses an unsupported provider/model with a message; PR1–PR3 + port-claude PTY
stay green. See `docs/stories/personal-runners/PR4-command-profile-split/validation.md`.

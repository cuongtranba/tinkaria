# Overview — PR4 Command Profile Split

Part of **Personal Runners** (`../change-request.md`), epic PR4 (concept decision
#10). Stacks on **PR3** (reconciled with port-claude). The "secrets never leave
the member's machine" guarantee at the command layer.

## Current Behavior (reconciled stack)

- **`StartTurnCommand` carries `binaryPath`** (server-resolved from
  `RuntimeRegistry` via `runner-proxy.resolveProfileOverrides`) — an absolute path
  on the **server's** disk, meaningless on a member's machine.
- **`extraEnv`** carries profile `env` (non-secret today; `apiKeyRef` is a
  *reference*, not expanded — secrets do not currently transit the server, which
  PR4 makes an enforced invariant rather than an accident).
- **The runner consumes the server's `binaryPath`** for Codex (`getCodexManager`)
  and Claude SDK (`claude-harness` `pathToClaudeCodeExecutable`).
- **port-claude already resolves the binary runner-side for the PTY path**
  (`resolve-binary.adapter.ts`; `startClaudePtyTurn` takes no `binaryPath`) and
  handles OAuth tokens via a **runner-side pool** (not env). So the target pattern
  exists — for one path only.
- `RunnerRegistration.providers` is **hardcoded `["claude","codex"]`**;
  `capabilities` (PR3 field) is shape-only.

## Target Behavior

- **`StartTurnCommand` drops `binaryPath`.** The command carries *logical intent*
  (provider, model, effort, planMode, skills) — **never paths or secrets**. The
  **runner resolves its own binary** for all providers, unifying on port-claude's
  `resolve-binary.adapter` pattern (already used by PTY).
- **`extraEnv` is non-secret-only**, enforced + documented: the server passes only
  non-secret team env; the runner merges **local** env/secrets (API keys, OAuth)
  from its own machine — they never transit the server.
- **Capabilities are probed, not assumed.** The runner probes its real installed
  providers/binaries (+ models, reusing `RuntimeRegistry.probeCapabilities`) and
  advertises them in `RunnerRegistration.capabilities`. A turn whose
  provider/model the runner can't honor is **refused with a clear message**
  (capability gate, reusing PR3's turn-start gate), never a silent downgrade.

## Affected Users

- **Devs/QA** — turns run under the member's *own* binary + local secrets; a
  missing provider fails fast with guidance instead of an opaque error.
- **Security** — secrets are structurally prevented from transiting the server.

## Affected Product Docs

- `docs/decisions/0010-command-profile-split.md`
- `docs/decisions/0007/0008/0009` (PR1–PR3) — context.

## Non-Goals (deferred)

- **Multi-runner routing by capability** (pick a capable runner among several) —
  **PR5**. PR4 advertises capabilities + gates the *single active* runner; it does
  not choose between runners.
- **A secret vault / api-key store** beyond the existing runner-side OAuth pool —
  PR4 formalizes the "secrets stay local" contract; a general local secret store
  is a follow-up.
- **`ownerId`** — still deferred (no user-identity system).

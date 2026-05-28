# Design — PR4 Command Profile Split

## Domain Model

- **Logical intent** (server → runner, in `StartTurnCommand`): provider, model,
  effort, planMode, appendUserPrompt, skills, non-secret team `extraEnv`. *What*
  to run.
- **Physical resolution** (runner-local): which binary + its path, runtime
  version, and **all secrets** (API keys, OAuth tokens). *Where/how* to run.
  Never in the command.
- **Runner capabilities** (`RunnerRegistration.capabilities`): the providers the
  runner actually has installed + their probed models/versions. Advertised, not
  assumed.

## Application Flow

- **Command (server):** `resolveProfileOverrides` stops returning `binaryPath`;
  the server no longer touches `RuntimeRegistry` for the command. `extraEnv` =
  the profile's non-secret `env` only.
- **Binary resolution (runner):** all three factories resolve the binary
  runner-side via the existing `resolve-binary.adapter` (port-claude's PTY path
  already does). Codex (`getCodexManager`) and Claude SDK (`claude-harness`
  `pathToClaudeCodeExecutable`) switch from the server-sent `binaryPath` to the
  runner-resolved path.
- **Secrets (runner):** the runner merges local env/secrets (its own
  `process.env` + local secret sources + the OAuth pool for PTY). The server's
  `extraEnv` is layered as *non-secret* base only.
- **Capabilities:** at registration, the runner probes installed providers (e.g.
  `resolve-binary` existence per provider) + models (`probeCapabilities`) and
  writes `capabilities` into `RunnerRegistration`. The hardcoded
  `providers: ["claude","codex"]` becomes the probed set.
- **Capability gate (turn start):** before dispatch, if the runner's advertised
  capabilities lack the turn's provider (or model), **refuse** with a clear
  message — reusing PR3's `getRunnerReadiness`/`sendCommand` gate seam (extend it
  to carry capabilities).

## Interface Contract

- **`StartTurnCommand`** — **remove `binaryPath`** (breaking the internal
  server↔runner contract; both sides change together). `extraEnv` kept but
  **contractually non-secret**; document it in the type.
- **`RunnerRegistration.capabilities`** — populated: `{ providers:
  AgentProvider[], models?: Record<provider, string[]>, versions?: ... }` (probed).
- **Capability gate error** — `Runner <id> cannot run <provider>/<model>
  (installed: <list>) — install it on the runner or pick another` (client-visible).
- **Binary resolution interface** — a single runner-side resolver used by all
  factories (the `resolve-binary.adapter`); no provider sends a path over the wire.

## Data Model

- No tables. `StartTurnCommand` loses a field (additive-safe: both ends in this
  repo). `RunnerRegistration.capabilities` gains real content (additive; KV
  ephemeral, self-healing). No migration.

## UI / Platform Impact

- **Platform** — turns run under the member's own binary + local secrets; the key
  Personal-Runners property. A missing provider is surfaced, not silently failed.
- **Browser** — the capability-refusal message reaches the client like PR3's
  incompatible message.

## Observability

- Log capability probe results at registration (providers + models found).
- Log capability-gate refusals (runnerId, requested provider/model, installed set).
- **Audit guard**: a check/test that `extraEnv` on the wire contains no
  secret-shaped values (API_KEY/TOKEN/SECRET patterns) — the secret-boundary proof.

## Alternatives Considered

1. **Keep `binaryPath`, just null it on member machines.** Rejected — leaves the
   meaningless field + the server-side resolution; the clean contract is to drop
   it and resolve runner-side (which port-claude's PTY already does).
2. **A second resolver for Codex/Claude separate from PTY's.** Rejected — unify on
   the one `resolve-binary.adapter` to avoid divergence (a flagged port-claude
   tension).
3. **Enforce capabilities by routing to a capable runner.** That's **PR5**
   (multi-runner routing). PR4 only *advertises* + gates the single active runner;
   refuse-not-route is the correct PR4 boundary (concept #10: "refuse with a clear
   message").
4. **A general local secret vault now.** Deferred — PR4 formalizes the
   "secrets-stay-local" contract + uses the existing OAuth pool; a generic vault
   is a follow-up.

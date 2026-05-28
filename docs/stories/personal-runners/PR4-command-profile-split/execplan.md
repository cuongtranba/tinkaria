# Exec Plan — PR4 Command Profile Split

## Goal

Make the runner command carry *logical intent only* — drop server-resolved
`binaryPath`, keep `extraEnv` non-secret, have the runner resolve its own binary
and merge local secrets, and advertise real probed capabilities with a fail-fast
capability gate — so secrets never transit the server and a member's own
binary/account is used.

## Scope

In scope:

- **Drop `binaryPath`** from `StartTurnCommand`; remove the server's binaryPath
  resolution (`resolveProfileOverrides` binaryPath branch + the `RuntimeRegistry`
  lookup feeding the command).
- **Runner-side binary resolution for all providers** — unify Codex + Claude SDK
  onto port-claude's `resolve-binary.adapter` pattern (PTY already uses it).
- **`extraEnv` non-secret-only** — document + enforce (a guard/audit that secrets
  aren't placed in it); the runner merges local env/secrets itself.
- **Capability probing + advertisement** — runner probes installed providers
  (+ models via `RuntimeRegistry.probeCapabilities`), advertises in
  `RunnerRegistration.capabilities`; replace the hardcoded providers list.
- **Capability turn-start gate** — refuse a turn whose provider/model the
  (single active) runner lacks, with a clear message (reuse PR3's gate seam).

Out of scope: multi-runner routing/picker (PR5); a general local secret vault;
ownerId.

## Risk Classification

Risk flags: **Audit/security** (secrets/`extraEnv` boundary — the core change),
Public contracts (`StartTurnCommand` drops `binaryPath`; registration capabilities
shape), Existing behavior (binary/env resolution moves server→runner; Codex +
Claude SDK paths change), Cross-platform (runner resolves its own binary).

Hard gate: **Audit/security** (secret handling) → high-risk, confirmed.

## Work Phases

1. **Design lock** — this packet + decision 0010 (esp. the unify-on-port-claude's
   resolver decision + the extraEnv-secret boundary).
2. **Validation planning** — tests: no `binaryPath` in the command; runner
   resolves its binary for each provider; `extraEnv` carries no secret (audit
   test); capability probe returns real installed set; capability gate refuses an
   unsupported provider/model.
3. **Implementation** — (a) drop binaryPath (shared + server + runner consumers,
   unify resolver); (b) extraEnv non-secret guard + runner local-env merge;
   (c) capability probe + advertise + gate.
4. **Verification** — dual-signal: a real turn runs with the runner resolving its
   own binary (no server path); `/health`/registry shows probed capabilities; a
   turn for an uninstalled provider is refused with the message; secrets absent
   from the command on the wire.
5. **Review** — security (the secret boundary is the crux) + TS.
6. **Harness** — story/decision/trace/TEST_MATRIX/backlog.

## Stop Conditions

Pause for human confirmation if:

- Unifying binary resolution would require changing port-claude's PTY resolver in
  a non-trivial way (reconcile, don't fork).
- Enforcing the capability gate needs **multi-runner routing** to be useful
  (that's PR5 — PR4 gates the single active runner only).
- Removing `binaryPath` breaks a path that legitimately needs a server-supplied
  binary (there should be none on a member machine — confirm).

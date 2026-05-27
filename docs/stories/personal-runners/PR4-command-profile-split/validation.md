# Validation — PR4 Command Profile Split

## Proof Strategy

PR4 is done when the runner command carries **no path and no secret**, the runner
resolves its own binary for every provider and merges local secrets, real
capabilities are advertised, and an unsupported provider/model turn is refused —
proven by unit/integration tests plus a running turn that uses the runner's own
binary, and an audit that secrets never appear in the command on the wire.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | `StartTurnCommand` has no `binaryPath`. `resolveProfileOverrides` returns no `binaryPath` (env only). Runner binary resolver returns a path per provider. Capability probe → real installed set. Capability gate: requested provider not in capabilities → refuse (message); present → pass. |
| Integration | A turn dispatched with no `binaryPath`; the runner resolves its own binary (Codex + Claude SDK + PTY) and runs. `RunnerRegistration.capabilities` carries probed providers/models. Gate refuses an uninstalled-provider turn without dispatching. |
| E2E | Boot (callout default); a real Claude turn runs end-to-end with the runner-resolved binary (no server path). `/health`/registry shows probed capabilities. A turn for an absent provider → client sees the refuse message. |
| Security (the crux) | **Audit**: serialize a representative `StartTurnCommand` and assert no secret-shaped values (API_KEY/TOKEN/SECRET/Bearer) and no `binaryPath`. Confirm `extraEnv` is profile non-secret env only; secrets resolved runner-side (process.env / OAuth pool). |
| Regression | PR1–PR3 suites stay green; port-claude PTY path still resolves its binary (unchanged or unified). |

## Fixtures

- A fake runtime/binary for resolver tests; a provider profile with `env` (non-secret) + an `apiKeyRef`.
- A capabilities fixture (e.g. claude-only) to drive the gate-refusal case.
- Dedicated ports + temp `NATS_DATA_DIR`/`TINKARIA_RUNNER_HOME`. Never `:3210`.

## Commands

```text
bunx @typescript/native-preview --noEmit -p tsconfig.json
bun test src/shared src/server src/runner   # command shape + resolver + gate + audit
bun test src/nats/                           # PR1–PR3 green
# running (dedicated port): boot, run a turn (runner-resolved binary), check capabilities in /health,
# refuse an absent-provider turn; audit the wire command for secrets/binaryPath
```

## Acceptance Evidence (2026-05-27 — team-lead independent gate, dedicated ports)

- **No `binaryPath` / no secret in the command**: `runner-protocol.test.ts`
  shape-audit (no `binaryPath`; regex API_KEY|TOKEN|SECRET|Bearer|sk- finds
  nothing); `resolveProfileOverrides` returns env only. typecheck 0.
- **Runner resolves its own binary**: Claude SDK via `resolveClaudeBinary` (the
  PTY adapter), Codex via `resolveCodexBinary` (`which codex`); no server path on
  the wire. PTY unchanged.
- **Capabilities advertised**: boot `/health` → `capabilities:{providers:
  ["claude","codex"]}`; server log `Probed capabilities: providers=[claude, codex]`.
- **Capability gate**: `runner-incompatible-gate.test.ts` —
  `cannot run provider="codex" (installed: claude)`, not dispatched.
- **Tests**: 144/0 across `src/runner` + gate + runner-proxy + pr3-liveness +
  `src/nats`. `runner-proxy.test.ts` 16/0 (after fixing the PR3-fail-closed-gate
  regression + port-claude `disposeChat` staleness).

**Caveats / deferred:** model-level capability probing (providers-only now —
`RuntimeRegistry.probeCapabilities` is server-side); the capability gate is
**fail-open when `capabilities=null`** (pre-PR4 KV entry, backward-compat) — under
Stage-3 security review. Model-level gate + multi-runner routing = PR5.

**Stage-3 security review** of the secret boundary is in flight; findings + any
must-fix will be appended.

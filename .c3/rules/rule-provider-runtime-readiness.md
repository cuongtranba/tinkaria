---
id: rule-provider-runtime-readiness
c3-seal: 18a2c5731e3d941df36f09587c37fc701be2696c2dd259afb94489ceba181e9e
title: provider-runtime-readiness
type: rule
goal: Enforce defensive, observable, and bounded runtime behavior for every agent-provider integration so a started session cannot fail silently or hang indefinitely without operator evidence.
---

## Goal

Enforce defensive, observable, and bounded runtime behavior for every agent-provider integration so a started session cannot fail silently or hang indefinitely without operator evidence.

## Rule

Every server-side agent provider MUST define an explicit runtime-readiness contract at the harness boundary. `startup`, `resume`, `send`, `stream`, timeout, cancellation, and shutdown behavior must be bounded, surfaced, and testable. Provider integrations may not rely on implicit SDK behavior or best-effort logging as their only failure handling.

Required contract:

1. Terminal failure semantics: startup, resume, first-send, mid-stream, and shutdown failures must resolve to an explicit terminal result or surfaced degraded state. No silent stall paths.
2. Bounded waiting: provider startup, resume, and turn streaming must have explicit timeout and cancellation behavior. Infinite waits are forbidden.
3. Structured diagnostics: every surfaced provider failure must include enough structured context to debug the phase that failed: provider, chat/session identity, failure phase, and retry or recovery state when present.
4. Stale-handle policy: resumable session ids or provider handles must be revalidated against the source of truth and have an explicit stale-session fallback path.
5. Shape validation before normalization: malformed provider events or tool payloads must fail closed before they are normalized into shared transcript/runtime types.
6. Focused harness proof: provider-owned tests must cover the happy path and the provider's critical failure modes: startup failure, stale resume, malformed event, timeout or cancellation, and mid-stream abort.
7. Coordinator isolation: shared orchestration code may compose prompts and lifecycle state, but it must not absorb provider-specific retry, timeout, or transport recovery logic that belongs in the harness.

## Golden Example

```typescript
export async function startProviderTurn(args: ProviderTurnArgs): Promise<HarnessTurn> {
  const session = await withTimeout(
    args.binding.startSession(args.session),
    PROVIDER_START_TIMEOUT_MS,
    "provider startup timed out",
  )

  try {
    return await withTimeout(
      args.binding.startTurn({
        ...args.turn,
        session,
      }),
      PROVIDER_TURN_TIMEOUT_MS,
      "provider turn startup timed out",
    )
  } catch (error) {
    throw new ProviderTurnStartError({
      provider: args.provider,
      chatId: args.chatId,
      phase: "startTurn",
      sessionToken: args.sessionToken,
      cause: error,
    })
  }
}
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| Provider startup failure only logs a warning and leaves the turn pending | Surface an explicit failed result or degraded state tied to the failed phase | Operators and users cannot distinguish a stuck session from a slow one |
| Harness waits indefinitely for a first event or resume acknowledgement | Add bounded timeout and cancellation semantics at the provider seam | Hung upstream sessions become invisible operational failures |
| Failure diagnostics only contain a free-form message | Attach provider name, phase, session identity, and retry state | Incidents become hard to reproduce or correlate |
| Only coordinator tests exercise failure handling | Add focused harness tests for provider-owned failure modes | The seam itself stays undertested and future providers drift |

## Scope

Applies to all server-side AI provider integrations and their lower-level runtime adapters. This includes dedicated `*-harness.ts` modules, provider SDK bindings, subprocess bridges, and remote kit/runtime seams that deliver `HarnessTurn` behavior into `AgentCoordinator`.

## Override

Temporary exceptions require an ADR that names the missing readiness behavior, the operational risk, the compensating mitigation, and the removal condition. `The SDK handles it internally` is not sufficient justification.

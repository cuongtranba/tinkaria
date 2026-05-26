---
id: rule-provider-harness-boundaries
c3-seal: fe9a31e1b421c2c1d15c16b6934f7cfb9587dfa5ba0dd35c1faa0177a595601e
title: provider-harness-boundaries
type: rule
goal: Keep provider-specific bootstrap, transport, and turn-start choreography isolated behind dedicated harness seams so the shared coordinator stays provider-agnostic and testable.
---

## Goal

Keep provider-specific bootstrap, transport, and turn-start choreography isolated behind dedicated harness seams so the shared coordinator stays provider-agnostic and testable.

## Rule

Provider-specific bootstrap, transport, and turn startup logic MUST live in a dedicated `*-harness.ts` seam. `AgentCoordinator` may compose prompt/lifecycle state and call one `start*Turn()` entrypoint per provider, but it may not inline provider SDK bootstrap, runtime session-start choreography, or transport fallback behavior.

## Golden Example

```typescript
export async function startCodexTurn(args: {
  binding: CodexHarnessBinding
  chatId: string
  projectId: string
  localPath: string
  content: string
  model: string
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
}): Promise<HarnessTurn> {
  await args.binding.startSession({
    chatId: args.chatId,
    projectId: args.projectId,
    cwd: args.localPath,
    model: args.model,
    sessionToken: args.sessionToken,
  })

  return await args.binding.startTurn({
    chatId: args.chatId,
    content: args.content,
    model: args.model,
    onToolRequest: args.onToolRequest,
  })
}

turn = await startCodexTurn({
  binding: this.codexRuntime,
  chatId: args.chatId,
  projectId: project.id,
  localPath: project.localPath,
  content: buildTurnPrompt(args.content, { delegatedContext: args.delegatedContext, isSpawned: args.isSpawned, chatId: args.chatId }),
  model: args.model,
  sessionToken: chat.sessionToken,
  onToolRequest,
})
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| AgentCoordinator directly calls provider SDK/bootstrap/session-start APIs inline | Move the provider choreography into a dedicated harness and have the coordinator call start*Turn() | It couples shared lifecycle state to provider quirks and makes boundary tests brittle. |
| Provider transport assertions live only in broad coordinator tests | Add focused harness tests that exercise provider-owned bootstrap and startup failure behavior directly | Coordinator tests should verify orchestration, not become the only proof of provider transport semantics. |

## Scope

Applies to all server-side agent-provider integrations. `agent.ts` may compose prompts and shared lifecycle state, but provider-specific SDK bootstrap, runtime binding, IPC choreography, and startup fallback behavior belong in provider-owned harness modules plus focused harness tests.

## Override

A provider may inline its seam into the coordinator only temporarily during initial bring-up, and only until a dedicated harness module exists in the same change. Permanent coordinator inlining requires an ADR that explains why a harness seam is impossible or actively harmful.

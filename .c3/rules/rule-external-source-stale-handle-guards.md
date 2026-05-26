---
id: rule-external-source-stale-handle-guards
c3-seal: 5189bd9460d3ef8e8af565cf6768af73f1cc8246d35ca5482f49da8b465a8420
title: external-source-stale-handle-guards
type: rule
goal: Guard every use of external handles and resumable identifiers with source-of-truth validation plus an explicit stale-reference fallback path.
---

## Goal

Guard every use of external handles and resumable identifiers with source-of-truth validation plus an explicit stale-reference fallback path.

## Rule

Before Tinkaria uses any provider-owned session id, filesystem-backed handle, or other external reference for resume, mutation, or import, it MUST validate that the owner still recognizes the reference and MUST branch explicitly on stale or missing results instead of assuming persisted local metadata is authoritative.

## Golden Example

```typescript
const filePath = await findSessionFile(sessionId, provider, projectPath)
if (!filePath) {
  await store.setSessionToken(chatId, null)
  return { kind: "stale_external_reference", sessionId }
}

return startClaudeTurn({
  content,
  localPath: projectPath,
  model,
  planMode,
  sessionToken: sessionId,
  onToolRequest,
})

export async function inspectSessionRuntime(sessionId: string, provider: AgentProvider, projectPath: string) {
  const runtimeFile = await findSessionFile(sessionId, provider, projectPath)
  if (!runtimeFile) return null
  return inspectSessionRuntimeFile(runtimeFile, provider)
}
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| Passing a stored external id directly into a provider resume call | Resolve the backing external object first and branch on stale state | A local token string is cached metadata, not proof that the external owner still has the resource |
| Treating stale external references as generic unexpected crashes | Return a typed stale-reference outcome or clear the cached handle before retrying | Users and retry logic need to distinguish foreign-state drift from true internal faults |
| Overwriting the original provider error with an opaque fallback | Preserve the provider failure details while still executing the local stale-handle branch | The external payload is evidence needed for diagnosis and provider-facing bug reports |

## Scope

All server code that consumes identifiers or handles owned by external providers, the filesystem, subprocesses, or remote services. This is especially important for session resume, transcript import, runtime inspection, and reconnect or reclaim flows.

## Override

Skip the lookup only when the owning system guarantees validity within the same synchronous transaction or when the handle was created and consumed inside one trusted in-process boundary without a persistence or transport hop.

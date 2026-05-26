---
id: rule-type-guards
c3-seal: 5316858be1a0bc59108e45378ced580899281edc2043724ed1c214127cc2617c
title: type-guards
type: rule
goal: Runtime type validation uses named predicate functions (`is*`) for boolean checks and normalization functions (`normalize*`) for coercing inputs to valid values. Never inline type checks.
---

## Goal

Runtime type validation uses named predicate functions (`is*`) for boolean checks and normalization functions (`normalize*`) for coercing inputs to valid values. Never inline type checks.

## Rule

(1) Boolean type checks MUST be named `is<TypeName>()` returning `value is T`. (2) Value coercion MUST use `normalize<FieldName>()` returning the valid type with fallback. (3) Required lookups use `require<Entity>()` (throws), optional use `get<Entity>()` (returns null).

## Golden Example

```typescript
// ✅ Type predicate — is* naming
export function isClaudeReasoningEffort(value: unknown): value is ClaudeReasoningEffort {
  return CLAUDE_REASONING_OPTIONS.some((option) => option.id === value)
}

// ✅ Protocol validation guard
export function isClientEnvelope(value: unknown): value is ClientEnvelope {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<ClientEnvelope>
  return candidate.v === 1 && typeof candidate.type === "string"
}

// ✅ Normalize — coerce with safe fallback
function normalizeTerminalDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.round(value))
}

function clampScrollback(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCROLLBACK
  return Math.min(MAX_SCROLLBACK, Math.max(MIN_SCROLLBACK, Math.round(value)))
}

export function normalizeClaudeContextWindow(
  model: string,
  contextWindow: unknown
): ClaudeContextWindow | undefined {
  const supportedOptions = CLAUDE_CONTEXT_WINDOW_OPTIONS_BY_MODEL[model]
  if (!supportedOptions) return undefined
  return supportedOptions.some((opt) => opt.id === contextWindow)
    ? (contextWindow as ClaudeContextWindow)
    : undefined
}

// ✅ require* vs get* — throw vs null duality
requireChat(chatId: string): ChatRecord {
  const chat = this.state.chatsById.get(chatId)
  if (!chat || chat.deletedAt) throw new Error("Chat not found")
  return chat
}

getChat(chatId: string): ChatRecord | null {
  const chat = this.state.chatsById.get(chatId)
  if (!chat || chat.deletedAt) return null
  return chat
}
```

## Not This

```typescript
// ❌ Inline type check instead of named predicate
if (typeof value === "string" && ["low","medium","high"].includes(value)) { ... }

// ❌ Missing return type annotation on predicate
function isValid(value: unknown) {  // missing `: value is T`
  return typeof value === "string"
}

// ❌ Coercion without fallback
function normalize(value: number) {
  return Math.round(value)  // no NaN/Infinity check
}

// ❌ Single method that sometimes throws, sometimes returns null
getOrThrow(id: string) {
  const item = this.map.get(id)
  if (throwOnMissing) throw new Error("...")  // ambiguous API
  return null
}
```

## Scope

All TypeScript files. Especially src/shared/types.ts, src/server/provider-catalog.ts, src/server/keybindings.ts.

## Override

Simple `typeof` checks in local scope are fine when the result is used immediately and not reusable.

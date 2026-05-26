---
id: rule-graceful-fallbacks
c3-seal: fe0242c722127d8ff5ec55b2e644d8067e9660543e62d1330d4b56d6a9da4a90
title: graceful-fallbacks
type: rule
goal: External inputs (user config, file reads, WebSocket messages, CLI args) are normalized through dedicated functions that always return valid values, never crash.
---

## Goal

External inputs (user config, file reads, WebSocket messages, CLI args) are normalized through dedicated functions that always return valid values, never crash.

## Rule

(1) File reads MUST handle ENOENT + SyntaxError with defaults. (2) Numeric inputs MUST check `Number.isFinite()` before use. (3) JSON parsing MUST catch SyntaxError and provide fallback. (4) Use `normalize*()` functions that return valid type, never throw. (5) Snapshot loading failures MUST reset to clean state, not crash.

## Golden Example

```typescript
// ✅ File read with graceful fallback chain
export async function readKeybindingsSnapshot(filePath: string) {
  try {
    const text = await readFile(filePath, "utf8")
    if (!text.trim()) {
      return createDefaultSnapshot(filePath, "File was empty. Using defaults.")
    }
    const parsed = JSON.parse(text) as KeybindingsFile
    return normalizeKeybindings(parsed, filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return createDefaultSnapshot(filePath)
    }
    if (error instanceof SyntaxError) {
      return createDefaultSnapshot(filePath, "Invalid JSON. Using defaults.")
    }
    throw error  // only re-throw unexpected errors
  }
}

// ✅ Numeric normalization with finite check + clamping
function normalizeTerminalDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.round(value))
}

function clampScrollback(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCROLLBACK
  return Math.min(MAX_SCROLLBACK, Math.max(MIN_SCROLLBACK, Math.round(value)))
}

// ✅ Corrupt snapshot recovery
try {
  const raw = await Bun.file(snapshotPath).text()
  snapshot = JSON.parse(raw) as StoreSnapshot
} catch (error) {
  console.warn(`${LOG_PREFIX} Failed to load snapshot, clearing storage`)
  await this.clearStorage()
  snapshot = createEmptyState()
}

// ✅ WebSocket message validation before processing
const parsed = JSON.parse(data as string)
if (!isClientEnvelope(parsed)) {
  send(ws, { v: PROTOCOL_VERSION, type: "error", message: "Invalid message format" })
  return
}

// ✅ CLI arg validation with descriptive errors
const next = args[++i]
if (!next) throw new Error("Missing value for --port")
const port = parseInt(next, 10)
if (!Number.isFinite(port)) throw new Error(`Invalid port: ${next}`)
```

## Not This

```typescript
// ❌ Crash on missing file
const text = await readFile(path, "utf8")  // throws if missing
const data = JSON.parse(text)              // throws on bad JSON

// ❌ No NaN check on numeric input
const cols = Math.round(value)  // NaN passes through silently

// ❌ Assuming JSON.parse always succeeds
const msg = JSON.parse(data) as ClientMessage  // SyntaxError crash

// ❌ Swallowing ALL errors
try { ... } catch { return null }  // hides bugs, only catch expected errors
```

## Scope

All code handling external input: file reads, WebSocket messages, CLI args, user configuration, snapshot loading.

## Override

Internal function calls between trusted components may skip normalization when types guarantee validity at compile time.

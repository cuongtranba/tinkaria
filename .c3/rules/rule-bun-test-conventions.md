---
id: rule-bun-test-conventions
c3-seal: 74c230091f02462dc2f63f989ea9e6812bbfcf62f49576fd938dce35d0d3c0e5
title: bun-test-conventions
type: rule
goal: 'All tests use Bun test framework with consistent structure: describe/test grouping, afterEach cleanup, typed test helpers, explicit resource management, environment variable isolation (save/clear/restore), and deterministic shell environments for PTY tests.'
---

## Goal

All tests use Bun test framework with consistent structure: describe/test grouping, afterEach cleanup, typed test helpers, explicit resource management, environment variable isolation (save/clear/restore), and deterministic shell environments for PTY tests.

## Rule

Tests MUST: (1) import from `bun:test`, (2) use `describe`/`test` (not `it`), (3) clean up resources in `afterEach`, (4) use typed helper factories for test data, (5) name test files `[module].test.ts[x]` co-located with source, (6) save and restore ALL environment variables that affect runtime behavior — capture originals at module scope, clear in `beforeEach`, restore in `afterEach`, (7) when testing real PTY/shell processes, isolate the shell from user config (ZDOTDIR with minimal .zshrc) to prevent async prompt frameworks from making tests flaky.

## Golden Example

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// --- Typed test data factory ---
function entry(kind: "user_prompt" | "assistant_text", content: string): TranscriptEntry {
  return { kind, content, timestamp: Date.now() }
}

// --- Async condition helper with timeout ---
async function waitFor(fn: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("waitFor timed out")
    await new Promise((r) => setTimeout(r, 10))
  }
}

// --- Environment variable isolation ---
const originalRuntimeProfile = process.env.KANNA_RUNTIME_PROFILE
const originalDisableSelfUpdate = process.env.KANNA_DISABLE_SELF_UPDATE

describe("runCli", () => {
  // Clear env vars BEFORE each test
  beforeEach(() => {
    delete process.env.KANNA_DISABLE_SELF_UPDATE
    delete process.env.KANNA_RUNTIME_PROFILE
  })

  // Restore originals AFTER each test
  afterEach(() => {
    if (originalRuntimeProfile === undefined) {
      delete process.env.KANNA_RUNTIME_PROFILE
    } else {
      process.env.KANNA_RUNTIME_PROFILE = originalRuntimeProfile
    }
    if (originalDisableSelfUpdate === undefined) {
      delete process.env.KANNA_DISABLE_SELF_UPDATE
    } else {
      process.env.KANNA_DISABLE_SELF_UPDATE = originalDisableSelfUpdate
    }
  })

  test("starts normally", async () => { /* ... */ })
})

// --- PTY test with isolated shell config ---
describe("TerminalManager", () => {
  test("ctrl+d preserves eof behavior", async () => {
    // Use ZDOTDIR with minimal .zshrc to bypass user prompt config
    // (starship, powerline). Async prompts make ctrl+d unreliable.
    const originalZdotdir = process.env.ZDOTDIR
    process.env.ZDOTDIR = tempProjectPath
    await Bun.write(join(tempProjectPath, ".zshrc"), "# minimal test shell\n")
    try {
      const { manager } = await createSession(terminalId)
      manager.write(terminalId, "\x04")
      await waitFor(() => manager.getSnapshot(terminalId)?.status === "exited", 5000)
      expect(manager.getSnapshot(terminalId)?.exitCode).toBe(0)
    } finally {
      if (originalZdotdir === undefined) delete process.env.ZDOTDIR
      else process.env.ZDOTDIR = originalZdotdir
    }
  })
})

// --- Fake implementation pattern (not jest.mock) ---
class FakeWebSocket {
  sent: string[] = []
  readyState = 1
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
}
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| import { it, jest } from "@jest/globals" | import { test } from "bun:test" | Wrong framework; Tinkaria uses Bun test only |
| it("should work", ...) | test("works", ...) | Convention is test, not it |
| no cleanup of temp dirs after test | afterEach with rm(dir, { recursive: true }) | Leaked resources pollute later runs |
| jest.mock("./module") | fake class/object inline | Bun test has no Jest mock API |
| tests read process.env.X without save/restore | capture at module scope, clear in beforeEach, restore in afterEach | Env leaks between tests and CI may silently skip code paths |
| PTY tests use user shell config as-is | set ZDOTDIR plus minimal .zshrc | Starship/powerline async rendering makes Ctrl+D flaky under parallel load |
| empty ZDOTDIR temp dir with no .zshrc | create .zshrc with a comment | zsh-newuser-install wizard blocks terminal tests with an interactive menu |

## Scope

All `*.test.ts` and `*.test.tsx` files in src/.

## Override

None. All tests follow Bun conventions.

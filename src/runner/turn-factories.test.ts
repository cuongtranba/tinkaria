/**
 * PR4 Stage 1 — turn-factories shape tests.
 *
 * Verifies that startCodexTurn and startClaudeTurn no longer accept a
 * binaryPath argument and that runner-side binary resolution is in place.
 */
import { describe, expect, test } from "bun:test"
import { startCodexTurn, startClaudeTurn } from "./turn-factories"
import type { ResolveClaudeBinaryResult } from "../server/claude-pty/resolve-binary.adapter"

// ── Shape: no binaryPath in startCodexTurn params ───────────────────

describe("startCodexTurn signature (PR4 — no binaryPath)", () => {
  test("startCodexTurn parameters do not include binaryPath", () => {
    // Compile-time: if binaryPath existed, assigning its type would be an error.
    // Runtime: verify the function itself exists and is callable with extraEnv only.
    type StartCodexTurnArgs = Parameters<typeof startCodexTurn>[0]
    const _typeCheck: keyof StartCodexTurnArgs extends
      "chatId" | "content" | "localPath" | "model" | "effort" | "serviceTier" | "planMode" | "sessionToken" | "onToolRequest" | "extraEnv"
      ? true : false = true
    expect(_typeCheck).toBe(true)
  })

  test("startCodexTurn params type has no binaryPath key", () => {
    // We use a type-level trick: "binaryPath" should not be assignable to keyof Args.
    type Args = Parameters<typeof startCodexTurn>[0]
    type HasBinaryPath = "binaryPath" extends keyof Args ? true : false
    const hasIt: HasBinaryPath = false
    expect(hasIt).toBe(false)
  })
})

// ── Shape: no binaryPath in startClaudeTurn params ──────────────────

describe("startClaudeTurn signature (PR4 — no binaryPath)", () => {
  test("startClaudeTurn params type has no binaryPath key", () => {
    type Args = Parameters<typeof startClaudeTurn>[0]
    type HasBinaryPath = "binaryPath" extends keyof Args ? true : false
    const hasIt: HasBinaryPath = false
    expect(hasIt).toBe(false)
  })

  test("startClaudeTurn accepts _resolveBinary override for testability", () => {
    type Args = Parameters<typeof startClaudeTurn>[0]
    type HasResolver = "_resolveBinary" extends keyof Args ? true : false
    const hasIt: HasResolver = true
    expect(hasIt).toBe(true)
  })

  test("startClaudeTurn resolves binary through injected resolver (no PATH/fs)", async () => {
    const resolvedPaths: string[] = []
    const fakeResolver = async (): Promise<ResolveClaudeBinaryResult> => {
      const p = "/runner-resolved/claude"
      resolvedPaths.push(p)
      return { path: p, source: "PATH", triedPaths: [] }
    }

    // Minimal fake SDK that captures pathToClaudeCodeExecutable from options.
    let capturedExecutablePath: string | undefined
    const fakeSdk = {
      query(args: { prompt: string; options?: Record<string, unknown> }) {
        capturedExecutablePath = args.options?.pathToClaudeCodeExecutable as string | undefined
        return {
          async *[Symbol.asyncIterator]() {
            yield {
              type: "result",
              subtype: "success",
              is_error: false,
              duration_ms: 0,
              result: "",
            }
          },
          accountInfo: async () => null,
          getContextUsage: async () => null,
          interrupt: async () => {},
          close: () => {},
        }
      },
    }

    const turn = await startClaudeTurn({
      content: "test",
      localPath: "/tmp/workspace",
      model: "claude-sonnet-4-6",
      planMode: false,
      sessionToken: null,
      onToolRequest: async () => ({}),
      sdk: fakeSdk as never,
      _resolveBinary: fakeResolver,
    })
    // Drain the stream so the SDK query is actually invoked
    for await (const _ of turn.stream) { /* drain */ }

    expect(resolvedPaths).toHaveLength(1)
    expect(capturedExecutablePath).toBe("/runner-resolved/claude")
  })
})

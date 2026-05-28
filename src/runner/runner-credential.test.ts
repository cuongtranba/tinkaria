/**
 * Tests for the runner credential store (PR2 Stage 2).
 *
 * Covers:
 *  - write→read round-trip; shape is preserved.
 *  - credential file is written with mode 0600.
 *  - TINKARIA_RUNNER_HOME overrides the default ~/.tinkaria directory.
 *  - missing file returns null (not throw).
 *  - second write overwrites cleanly.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { writeRunnerCredential, readRunnerCredential, type RunnerCredential } from "./runner-credential"

const SAMPLE: RunnerCredential = {
  runnerId: "runner-1234567890-999",
  token: "eytest.token.value",
  natsUrl: "nats://127.0.0.1:4222",
  natsWsUrl: "ws://127.0.0.1:8222",
  pairedAt: 1700000000000,
}

let tmpDir: string
let savedRunnerHome: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pr2-cred-test-"))
  savedRunnerHome = process.env.TINKARIA_RUNNER_HOME
  process.env.TINKARIA_RUNNER_HOME = tmpDir
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  if (savedRunnerHome === undefined) {
    delete process.env.TINKARIA_RUNNER_HOME
  } else {
    process.env.TINKARIA_RUNNER_HOME = savedRunnerHome
  }
})

describe("runner-credential", () => {
  test("write then read round-trips all fields", async () => {
    await writeRunnerCredential(SAMPLE)
    const got = await readRunnerCredential()
    expect(got).toEqual(SAMPLE)
  })

  test("credential file is written with mode 0600", async () => {
    await writeRunnerCredential(SAMPLE)
    // The file lives at <TINKARIA_RUNNER_HOME>/runner-secret.json
    const filePath = join(tmpDir, "runner-secret.json")
    const mode = statSync(filePath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test("TINKARIA_RUNNER_HOME is honoured", async () => {
    const altDir = mkdtempSync(join(tmpdir(), "pr2-cred-alt-"))
    try {
      process.env.TINKARIA_RUNNER_HOME = altDir
      await writeRunnerCredential(SAMPLE)
      // Original tmpDir should have nothing.
      const inOriginal = await readRunnerCredential()
      // readRunnerCredential also reads from TINKARIA_RUNNER_HOME (already set to altDir)
      expect(inOriginal).toEqual(SAMPLE)
      const filePath = join(altDir, "runner-secret.json")
      const mode = statSync(filePath).mode & 0o777
      expect(mode).toBe(0o600)
    } finally {
      process.env.TINKARIA_RUNNER_HOME = tmpDir
      rmSync(altDir, { recursive: true, force: true })
    }
  })

  test("missing file returns null", async () => {
    const result = await readRunnerCredential()
    expect(result).toBeNull()
  })

  test("second write overwrites the first", async () => {
    await writeRunnerCredential(SAMPLE)
    const updated: RunnerCredential = { ...SAMPLE, runnerId: "runner-updated-42", pairedAt: 9999999999999 }
    await writeRunnerCredential(updated)
    const got = await readRunnerCredential()
    expect(got).toEqual(updated)
    // Mode preserved after overwrite
    const filePath = join(tmpDir, "runner-secret.json")
    const mode = statSync(filePath).mode & 0o777
    expect(mode).toBe(0o600)
  })
})

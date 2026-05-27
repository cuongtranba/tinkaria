/**
 * Tests for the runner pair flow (PR2 Stage 2).
 *
 * Spins up a real embedded server on a dedicated port, exercises the
 * POST /api/pairing/exchange path, and checks that writeRunnerCredential
 * is called with the correct shape. Uses a real pairing code issued by
 * the server (integration-style, same pattern as pairing-endpoints.test.ts).
 *
 * Also tests error propagation (expired/consumed → throws, unknown → throws).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { startServer } from "../server/server"
import { pairRunner } from "./runner-pair"
import { readRunnerCredential } from "./runner-credential"

type StartedServer = Awaited<ReturnType<typeof startServer>>

async function post(port: number, pathname: string, body?: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe("runner-pair (integration)", () => {
  let started: StartedServer | null = null
  let natsDataDir: string
  let runnerHome: string
  let savedRunnerHome: string | undefined

  beforeEach(() => {
    natsDataDir = mkdtempSync(join(tmpdir(), "pr2-pair-flow-nats-"))
    runnerHome = mkdtempSync(join(tmpdir(), "pr2-pair-flow-home-"))
    savedRunnerHome = process.env.TINKARIA_RUNNER_HOME
    process.env.TINKARIA_RUNNER_HOME = runnerHome
  })

  afterEach(async () => {
    await started?.stop()
    started = null
    rmSync(natsDataDir, { recursive: true, force: true })
    rmSync(runnerHome, { recursive: true, force: true })
    if (savedRunnerHome === undefined) {
      delete process.env.TINKARIA_RUNNER_HOME
    } else {
      process.env.TINKARIA_RUNNER_HOME = savedRunnerHome
    }
    delete process.env.NATS_AUTH_MODE
    delete process.env.NATS_DATA_DIR
  })

  test("pairRunner: exchange succeeds and credential is written", async () => {
    process.env.NATS_AUTH_MODE = "callout"
    process.env.NATS_DATA_DIR = natsDataDir
    started = await startServer({ port: 4391, host: "127.0.0.1", strictPort: true })
    const port = started.port

    // Issue a pairing code via the server.
    const issueRes = await post(port, "/api/pairing/code")
    expect(issueRes.status).toBe(200)
    const { code } = await issueRes.json() as { code: string }

    // Run the pair flow.
    await pairRunner({ serverUrl: `http://127.0.0.1:${port}`, code })

    // Credential file should now exist and have the right shape.
    const cred = await readRunnerCredential()
    expect(cred).not.toBeNull()
    expect(cred!.runnerId).toMatch(/^runner-/)
    expect(typeof cred!.token).toBe("string")
    expect(typeof cred!.natsUrl).toBe("string")
    expect(typeof cred!.natsWsUrl).toBe("string")
    expect(typeof cred!.pairedAt).toBe("number")
  }, 30_000)

  test("pairRunner: consumed code throws with status 410", async () => {
    process.env.NATS_AUTH_MODE = "callout"
    process.env.NATS_DATA_DIR = natsDataDir
    started = await startServer({ port: 4392, host: "127.0.0.1", strictPort: true })
    const port = started.port

    const { code } = await post(port, "/api/pairing/code").then((r) => r.json()) as { code: string }
    // First exchange succeeds.
    await pairRunner({ serverUrl: `http://127.0.0.1:${port}`, code })
    // Second exchange of same code should throw (consumed).
    await expect(pairRunner({ serverUrl: `http://127.0.0.1:${port}`, code })).rejects.toThrow(/consumed|410/i)
  }, 30_000)

  test("pairRunner: unknown code throws with status 400", async () => {
    process.env.NATS_AUTH_MODE = "callout"
    process.env.NATS_DATA_DIR = natsDataDir
    started = await startServer({ port: 4393, host: "127.0.0.1", strictPort: true })
    const port = started.port

    await expect(
      pairRunner({ serverUrl: `http://127.0.0.1:${port}`, code: "aaaaa-bbbbb-cccccc" })
    ).rejects.toThrow(/unknown|400/i)
  }, 30_000)
})

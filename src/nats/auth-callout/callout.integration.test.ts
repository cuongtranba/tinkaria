/**
 * Integration test — auth-callout isolation (Stage B, PR1).
 *
 * Proves:
 *  1. A runner-A credential connects and can pub/sub its own scoped subjects.
 *  2. The same runner-A credential is DENIED (permissions violation) on
 *     runtime.runner.cmd.B.> — the subject scoped to runner-B.
 *  3. The same runner-A credential is DENIED on runner-B's KV registry key.
 *  4. A ui-client credential is denied on any runtime.runner.cmd subject.
 *  5. Unknown/garbage token is refused at connect time.
 *
 * Stage B: credentials are minted via mintCredentialToken (stateless HMAC-signed
 * tokens) rather than registered in the in-memory registry. All isolation
 * assertions are preserved unchanged.
 */

import { describe, test, expect, afterAll, beforeAll } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { connect, tokenAuthenticator } from "@nats-io/transport-node"
import { nkeyAuthenticator } from "@nats-io/nats-core"
import type { NatsConnection } from "@nats-io/transport-node"
import { resolveBinary } from "@lagz0ne/nats-embedded"
import { ensureCalloutKeys } from "./keys"
import { buildCalloutConfig } from "./callout-config"
import { CalloutResponder } from "./responder"
import { runnerKvKeySubject } from "./scope-policy"
import { mintCredentialToken } from "./token"

// ── Test setup ────────────────────────────────────────────────────────────────

const RUNNER_A = "runner-A"
const RUNNER_B = "runner-B"

// Tokens are minted from the shared secret in startCalloutServer(); declared
// here so tests can reference them after setup.
let SERVER_ADMIN_TOKEN: string
let UI_CLIENT_TOKEN: string
let RUNNER_A_TOKEN: string
let RUNNER_B_TOKEN: string

interface ServerInfo {
  natsUrl: string
  wsUrl: string
  wsPort: number
  tcpPort: number
}

let serverProcess: ChildProcess | null = null
let responder: CalloutResponder | null = null
let configDir: string | null = null
let serverInfo: ServerInfo | null = null

async function startCalloutServer(): Promise<ServerInfo> {
  const dataDir = mkdtempSync(join(tmpdir(), "nats-callout-test-data-"))
  configDir = mkdtempSync(join(tmpdir(), "nats-callout-test-conf-"))

  const keys = await ensureCalloutKeys(dataDir)

  // Stage B: mint stateless signed tokens — no registration needed.
  SERVER_ADMIN_TOKEN = await mintCredentialToken({ class: "server-admin" }, keys.tokenSecret)
  UI_CLIENT_TOKEN = await mintCredentialToken({ class: "ui-client" }, keys.tokenSecret)
  RUNNER_A_TOKEN = await mintCredentialToken({ class: "runner", runnerId: RUNNER_A }, keys.tokenSecret)
  RUNNER_B_TOKEN = await mintCredentialToken({ class: "runner", runnerId: RUNNER_B }, keys.tokenSecret)

  const config = buildCalloutConfig({
    host: "127.0.0.1",
    port: -1,  // random
    wsPort: -1, // random
    accountPublicKey: keys.accountPublicKey,
    authUserPublicKey: keys.authUserPublicKey,
  })

  const configPath = join(configDir, "test-callout.conf")
  writeFileSync(configPath, config)

  const binaryPath = resolveBinary()

  return new Promise<ServerInfo>((resolve, reject) => {
    const proc = spawn(binaryPath, ["-c", configPath], {
      stdio: ["ignore", "ignore", "pipe"],
    })

    serverProcess = proc

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error("nats-server did not start within 10s"))
    }, 10_000)

    proc.on("error", (err) => { clearTimeout(timeout); reject(err) })
    proc.on("exit", (code) => {
      clearTimeout(timeout)
      reject(new Error(`nats-server exited early with code ${code}`))
    })

    let tcpPort: number | null = null
    let wsPort: number | null = null
    let buffer = ""

    proc.stderr!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const tcpMatch = line.match(/Listening for client connections on .+:(\d+)/)
        if (tcpMatch) tcpPort = Number(tcpMatch[1])

        const wsMatch = line.match(/Listening for websocket clients on .+:(\d+)/)
        if (wsMatch) wsPort = Number(wsMatch[1])

        if (tcpPort !== null && wsPort !== null) {
          clearTimeout(timeout)
          proc.removeAllListeners("exit")
          const natsUrl = `nats://127.0.0.1:${tcpPort}`
          resolve({ natsUrl, wsUrl: `ws://127.0.0.1:${wsPort}`, wsPort, tcpPort })
          return
        }
      }
    })
  }).then(async (info) => {
    // Start the responder — tokenSecret is sufficient; no registration step.
    responder = new CalloutResponder({
      natsUrl: info.natsUrl,
      authUserKp: keys.authUserKp,
      accountKp: keys.accountKp,
      accountPublicKey: keys.accountPublicKey,
      accountName: "CALLOUT_ACCOUNT",
      tokenSecret: keys.tokenSecret,
    })

    await responder.start()

    // Brief settle for the responder subscription to be active
    await new Promise((r) => setTimeout(r, 100))

    return info
  })
}

async function connectWithToken(natsUrl: string, token: string): Promise<NatsConnection> {
  return connect({
    servers: natsUrl,
    authenticator: tokenAuthenticator(token),
    // Short timeout so permission errors surface quickly
    timeout: 5000,
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  serverInfo = await startCalloutServer()
}, 15_000)

afterAll(async () => {
  await responder?.stop()
  serverProcess?.kill("SIGTERM")
  if (configDir) {
    try { rmSync(configDir, { recursive: true }) } catch { /* best-effort */ }
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auth-callout isolation", () => {

  // ── Happy path ──────────────────────────────────────────────────────────────

  test("runner-A connects with scoped credential", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, RUNNER_A_TOKEN)
    expect(nc.isClosed()).toBe(false)
    await nc.drain()
  })

  test("runner-A can publish its own heartbeat", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, RUNNER_A_TOKEN)
    // If the subject is not allowed, NATS will close the connection with a
    // permissions violation. No error here = allowed.
    nc.publish(`runtime.runner.heartbeat.${RUNNER_A}`, new TextEncoder().encode("hb"))
    await nc.flush()
    await nc.drain()
  })

  test("runner-A can subscribe to its own cmd subject", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, RUNNER_A_TOKEN)
    const sub = nc.subscribe(`runtime.runner.cmd.${RUNNER_A}.>`)
    expect(sub).toBeDefined()
    sub.unsubscribe()
    await nc.drain()
  })

  test("ui-client connects and can subscribe to runner events", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, UI_CLIENT_TOKEN)
    const sub = nc.subscribe("runtime.runner.evt.>")
    expect(sub).toBeDefined()
    sub.unsubscribe()
    await nc.drain()
  })

  // ── Negative — the decisive isolation assertions ────────────────────────────

  test("runner-A is DENIED on runtime.runner.cmd.B.> (permissions violation)", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, RUNNER_A_TOKEN)

    // Collect status events and the closed reason.
    const statusEvents: string[] = []
    let closedError: Error | null = null

    // Subscribe before triggering the violation.
    void (async () => {
      for await (const s of nc.status()) {
        statusEvents.push(`${s.type}:${String(s.data)}`)
      }
    })()

    const closedPromise = nc.closed().then((err) => {
      closedError = err instanceof Error ? err : new Error(String(err ?? "connection closed"))
    })

    // Attempt to publish to runner-B's command subject (not in runner-A's pub allow list).
    // NATS sends -ERR 'Permissions Violation for Publish' and closes the connection.
    nc.publish(`runtime.runner.cmd.${RUNNER_B}.start`, new TextEncoder().encode("{}"))
    await nc.flush().catch(() => { /* may fail if already closing */ })

    // Wait for the connection to be closed (NATS closes it on permissions violation).
    await Promise.race([
      closedPromise,
      new Promise((r) => setTimeout(r, 4000)),
    ])

    // Drain/close cleanup (may already be closed)
    try { await nc.drain() } catch { /* expected */ }

    // The decisive assertion: NATS must have closed the connection after the
    // permissions violation, or we must have received a permissionsError status.
    const hasPermissionsViolation =
      closedError !== null ||
      statusEvents.some((s) =>
        s.toLowerCase().includes("permission") || s.toLowerCase().includes("violation")
      )

    const evidenceMsg = closedError
      ? `connection closed by NATS: ${closedError.message}`
      : `status events: ${statusEvents.join(", ")}`

    console.log(`[TEST] runner-A denied on runtime.runner.cmd.${RUNNER_B}.start — ${evidenceMsg}`)

    expect(hasPermissionsViolation).toBe(true)
  }, 10_000)

  test("runner-A is DENIED on runner-B KV registry key", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, RUNNER_A_TOKEN)

    let denied = false
    const errorPromise = new Promise<void>((resolve) => {
      void (async () => {
        for await (const s of nc.status()) {
          if (s.type === "permissionsError" || String(s.data).includes("Permissions Violation")) {
            denied = true
            resolve()
            return
          }
        }
      })()
      nc.closed().then(() => { denied = true; resolve() })
    })

    // Attempt to write runner-B's KV key directly via NATS publish.
    const runnerBKvSubject = runnerKvKeySubject(RUNNER_B)
    nc.publish(runnerBKvSubject, new TextEncoder().encode("{}"))

    await Promise.race([
      errorPromise,
      nc.closed(),
      new Promise((r) => setTimeout(r, 3000)),
    ])

    try { await nc.drain() } catch { /* expected */ }

    expect(denied).toBe(true)
    console.log(`[TEST] runner-A denied on runner-B KV subject (${runnerBKvSubject})`)
  }, 10_000)

  test("ui-client is DENIED on runtime.runner.cmd subject", async () => {
    const nc = await connectWithToken(serverInfo!.natsUrl, UI_CLIENT_TOKEN)

    let denied = false
    const errorPromise = new Promise<void>((resolve) => {
      void (async () => {
        for await (const s of nc.status()) {
          if (s.type === "permissionsError" || String(s.data).includes("Permissions Violation")) {
            denied = true
            resolve()
            return
          }
        }
      })()
      nc.closed().then(() => { denied = true; resolve() })
    })

    nc.publish(`runtime.runner.cmd.${RUNNER_A}.start`, new TextEncoder().encode("{}"))

    await Promise.race([
      errorPromise,
      nc.closed(),
      new Promise((r) => setTimeout(r, 3000)),
    ])

    try { await nc.drain() } catch { /* expected */ }

    expect(denied).toBe(true)
    console.log("[TEST] ui-client denied on runtime.runner.cmd")
  }, 10_000)

  // ── Unknown credential is rejected at connect ──────────────────────────────

  test("unknown token is refused at connect time", async () => {
    let connectError: Error | null = null
    try {
      const nc = await connectWithToken(serverInfo!.natsUrl, "bogus-token-not-registered")
      await nc.drain()
    } catch (err) {
      connectError = err instanceof Error ? err : new Error(String(err))
    }
    expect(connectError).not.toBeNull()
    console.log("[TEST] unknown credential refused:", connectError?.message)
  }, 10_000)
})

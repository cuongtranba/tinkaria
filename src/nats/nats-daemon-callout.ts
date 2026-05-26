/**
 * NATS daemon — callout mode (Stage A, PR1).
 *
 * Spawns the bundled nats-server binary directly (via resolveBinary()) with a
 * self-generated auth-callout config, discovers the TCP + WS ports from stderr,
 * starts the CalloutResponder as the auth-service connection, then writes the
 * JSON handshake to stdout (same shape as nats-daemon.ts so NatsDaemonManager
 * can parse it).
 *
 * Invoked by NatsDaemonManager when NATS_AUTH_MODE=callout.
 * NOT used in token mode — that path stays in nats-daemon.ts unchanged.
 */

import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveBinary } from "@lagz0ne/nats-embedded"
import { ensureCalloutKeys } from "./auth-callout/keys"
import { buildCalloutConfig } from "./auth-callout/callout-config"
import { CalloutResponder } from "./auth-callout/responder"

const LOG_PREFIX = "[nats-daemon-callout]"

const host = process.env.NATS_HOST ?? "127.0.0.1"
const port = process.env.NATS_PORT ? Number(process.env.NATS_PORT) : -1
const wsPort = process.env.NATS_WS_PORT ? Number(process.env.NATS_WS_PORT) : -1
const storeDir = process.env.NATS_STORE_DIR
const dataDir = process.env.NATS_DATA_DIR

if (!dataDir) {
  console.error(LOG_PREFIX, "NATS_DATA_DIR is required in callout mode (key storage)")
  process.exit(1)
}

// ── 1. Ensure signing keys ────────────────────────────────────────────────────

const keys = await ensureCalloutKeys(dataDir)
console.warn(LOG_PREFIX, `Callout account public key: ${keys.accountPublicKey}`)
console.warn(LOG_PREFIX, `Auth-service user public key: ${keys.authUserPublicKey}`)

// ── 2. Generate config and write to temp file ─────────────────────────────────

const configContent = buildCalloutConfig({
  host,
  port,
  wsPort,
  storeDir,
  accountPublicKey: keys.accountPublicKey,
  authUserPublicKey: keys.authUserPublicKey,
})

const configDir = mkdtempSync(join(tmpdir(), "nats-callout-"))
const configPath = join(configDir, "callout.conf")
writeFileSync(configPath, configContent)

// ── 3. Spawn binary directly, parse ports from stderr ─────────────────────────

const binaryPath = resolveBinary()
console.warn(LOG_PREFIX, `Spawning binary: ${binaryPath}`)

const child = spawn(binaryPath, ["-c", configPath], {
  stdio: ["ignore", "ignore", "pipe"],
})

interface PortResult {
  tcpPort: number
  wsPort: number
}

const portResult = await new Promise<PortResult>((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill("SIGKILL")
    reject(new Error("nats-server (callout mode) did not start within 10s"))
  }, 10_000)

  child.on("error", (err) => {
    clearTimeout(timeout)
    reject(err)
  })

  child.on("exit", (code) => {
    clearTimeout(timeout)
    reject(new Error(`nats-server exited with code ${code} before ready`))
  })

  let tcpPort: number | null = null
  let wsPort: number | null = null
  let buffer = ""

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString()
    buffer += text
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      // "Listening for client connections on host:port"
      const tcpMatch = line.match(/Listening for client connections on .+:(\d+)/)
      if (tcpMatch) tcpPort = Number(tcpMatch[1])

      // "Listening for websocket clients on host:port"
      const wsMatch = line.match(/Listening for websocket clients on .+:(\d+)/)
      if (wsMatch) wsPort = Number(wsMatch[1])

      if (tcpPort !== null && wsPort !== null) {
        clearTimeout(timeout)
        child.removeAllListeners("exit")
        resolve({ tcpPort, wsPort })
        return
      }
    }
  })
})

const natsUrl = `nats://${host}:${portResult.tcpPort}`
const wsUrl = `ws://${host}:${portResult.wsPort}`

console.warn(LOG_PREFIX, `nats-server ready — url: ${natsUrl}, ws: ${wsUrl}`)

// ── 4. Start the callout responder ────────────────────────────────────────────

const responder = new CalloutResponder({
  natsUrl,
  authUserKp: keys.authUserKp,
  accountKp: keys.accountKp,
  accountPublicKey: keys.accountPublicKey,
  accountName: "CALLOUT_ACCOUNT",
  tokenSecret: keys.tokenSecret,
})

await responder.start()
console.warn(LOG_PREFIX, "Callout responder started")

// ── 5. Emit handshake JSON to stdout (same shape as nats-daemon.ts) ───────────

const info = {
  url: natsUrl,
  wsUrl,
  wsPort: portResult.wsPort,
  pid: process.pid,
}

process.stdout.write(JSON.stringify(info) + "\n")

// ── 6. Lifecycle ──────────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.warn(LOG_PREFIX, `Received ${signal}, shutting down`)
  await responder.stop()
  child.kill("SIGTERM")
  try {
    rmSync(configDir, { recursive: true })
  } catch { /* best-effort */ }
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

// Keep the process alive until nats-server exits.
await new Promise<void>((resolve) => {
  child.on("exit", () => resolve())
})

// Clean up config dir on abnormal exit.
try { rmSync(configDir, { recursive: true }) } catch { /* best-effort */ }

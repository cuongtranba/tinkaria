import { LOG_PREFIX } from "../shared/branding"
import { readToken } from "../nats/nats-token"
import { generateTitleForChat } from "../server/generate-title"
import { RunnerAgent, type TurnFactory } from "./runner-agent"
import { NatsCoordinationClient } from "./nats-coordination-client"
import { RunnerNatsHandler, connectRunner, shutdownConnection } from "./runner-nats"
import { startClaudeTurn, startCodexTurn, stopAllCodexSessions } from "./turn-factories"
import { pairRunner } from "./runner-pair"
import { readRunnerCredential } from "./runner-credential"

// ── Subcommand dispatch ───────────────────────────────────────────────────────
//
// Usage: bun run src/runner/runner.ts pair --server <url> --code <code>
//
// Any other invocation (or no args) falls through to the normal runner start.

if (process.argv[2] === "pair") {
  // Minimal arg parsing — enough to be useful; full packaging is PR8.
  const args = process.argv.slice(3)
  function argValue(flag: string): string | undefined {
    const idx = args.indexOf(flag)
    return idx !== -1 ? args[idx + 1] : undefined
  }
  const serverUrl = argValue("--server")
  const code = argValue("--code")
  if (!serverUrl || !code) {
    console.error(LOG_PREFIX, "Usage: bun run src/runner/runner.ts pair --server <url> --code <code>")
    process.exit(1)
  }
  await pairRunner({ serverUrl, code })
  process.exit(0)
}

// ── Normal runner start ───────────────────────────────────────────────────────

// Resolve NATS connection parameters: env vars win (server-spawned runners);
// otherwise fall back to the stored credential file (externally-launched runners).
let natsUrl = process.env.NATS_URL
let natsToken = process.env.NATS_TOKEN
const natsDataDir = process.env.NATS_DATA_DIR
let runnerId = process.env.RUNNER_ID ?? `runner-${process.pid}`

if (!natsUrl) {
  // No env — try the credential file written by the pair flow.
  const cred = await readRunnerCredential()
  if (cred) {
    natsUrl = cred.natsUrl
    natsToken = cred.token
    runnerId = cred.runnerId
    console.warn(LOG_PREFIX, `Loading credential from file — runnerId: ${runnerId}`)
  }
}

if (!natsUrl) {
  console.error(LOG_PREFIX, "NATS_URL environment variable is required (or run 'pair' to set up a credential file)")
  process.exit(1)
}

// Safety net: prevent stray unhandled rejections from crashing the runner.
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  console.warn(LOG_PREFIX, "unhandled rejection (swallowed):", message)
})

// Resolve NATS auth token: env var takes precedence, then file-based via NATS_DATA_DIR
const resolvedToken = natsToken ?? (natsDataDir ? await readToken(natsDataDir) : undefined)
const nc = await connectRunner({ natsUrl, token: resolvedToken })

console.warn(LOG_PREFIX, `Runner ${runnerId} connected to NATS at ${natsUrl}`)

const createTurn: TurnFactory = async (args) => {
  if (args.provider === "claude") {
    return startClaudeTurn({ ...args, binaryPath: args.binaryPath, extraEnv: args.extraEnv })
  }
  if (args.provider === "codex") {
    return startCodexTurn({ ...args, binaryPath: args.binaryPath, extraEnv: args.extraEnv })
  }
  throw new Error(`Provider ${args.provider} not supported in runner`)
}

const coordinationStore = new NatsCoordinationClient(nc)
const agent = new RunnerAgent({ nc, createTurn, generateTitle: generateTitleForChat, coordinationStore })
const handler = new RunnerNatsHandler({ nc, agent, runnerId })
await handler.start()

console.warn(LOG_PREFIX, `Runner ${runnerId} ready (pid: ${process.pid})`)

// Graceful shutdown
let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  console.warn(LOG_PREFIX, `Runner ${runnerId} shutting down...`)

  handler.dispose()

  // Cancel all active turns
  for (const chatId of [...agent.activeTurns.keys()]) {
    await agent.cancel(chatId)
  }

  stopAllCodexSessions()

  await shutdownConnection(nc)
  console.warn(LOG_PREFIX, `Runner ${runnerId} stopped`)
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

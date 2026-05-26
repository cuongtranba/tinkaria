import { LOG_PREFIX } from "../shared/branding"
import { readToken } from "../nats/nats-token"
import { generateTitleForChat } from "../server/generate-title"
import { RunnerAgent, type TurnFactory } from "./runner-agent"
import { NatsCoordinationClient } from "./nats-coordination-client"
import { RunnerNatsHandler, connectRunner, shutdownConnection } from "./runner-nats"
import { startClaudeTurn, startClaudePtyTurn, startCodexTurn, stopAllCodexSessions, stopAllClaudePtySessions } from "./turn-factories"

const natsUrl = process.env.NATS_URL
const natsToken = process.env.NATS_TOKEN
const natsDataDir = process.env.NATS_DATA_DIR
const runnerId = process.env.RUNNER_ID ?? `runner-${process.pid}`

if (!natsUrl) {
  console.error(LOG_PREFIX, "NATS_URL environment variable is required")
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
  if (args.provider === "claude-pty") {
    return startClaudePtyTurn({ ...args, nc })
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
  stopAllClaudePtySessions()

  await shutdownConnection(nc)
  console.warn(LOG_PREFIX, `Runner ${runnerId} stopped`)
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

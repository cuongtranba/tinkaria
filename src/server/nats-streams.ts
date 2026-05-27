import { jetstreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import type { NatsConnection } from "@nats-io/transport-node"
import { ALL_TERMINAL_EVENTS, ALL_CHAT_MESSAGE_EVENTS, CHAT_MESSAGE_EVENTS_STREAM_NAME, ALL_WORKSPACE_COORDINATION_EVENTS, WORKSPACE_COORDINATION_EVENTS_STREAM_NAME, ALL_SANDBOX_EVENTS, SANDBOX_EVENTS_STREAM_NAME } from "../shared/nats-subjects"
import { RUNNER_EVENTS_STREAM, ALL_RUNNER_EVENTS, RUNNER_REGISTRY_BUCKET } from "../shared/runner-protocol"
import { LOG_PREFIX } from "../shared/branding"

export const TERMINAL_EVENTS_STREAM = "KANNA_TERMINAL_EVENTS"
export const CHAT_MESSAGE_EVENTS_STREAM = CHAT_MESSAGE_EVENTS_STREAM_NAME

interface StreamConfig {
  name: string
  subjects: string[]
  max_age_ns: number
  max_msgs: number
  max_bytes: number
  storage?: StorageType
}

const FIVE_MINUTES_NS = 5 * 60 * 1_000_000_000
const THIRTY_MINUTES_NS = 30 * 60 * 1_000_000_000

async function ensureStream(nc: NatsConnection, config: StreamConfig): Promise<void> {
  const jsm = await jetstreamManager(nc)

  const streamConfig = {
    name: config.name,
    subjects: config.subjects,
    retention: RetentionPolicy.Limits,
    storage: config.storage ?? StorageType.Memory,
    max_age: config.max_age_ns,
    max_msgs: config.max_msgs,
    max_bytes: config.max_bytes,
  }

  try {
    await jsm.streams.info(config.name)
    await jsm.streams.update(config.name, streamConfig)
    console.warn(LOG_PREFIX, `JetStream stream ${config.name} updated`)
  } catch {
    // info() throws when stream doesn't exist — safe to create.
    // Any other error will surface from add().
    await jsm.streams.add(streamConfig)
    console.warn(LOG_PREFIX, `JetStream stream ${config.name} created`)
  }
}

/** Creates or updates the JetStream stream for terminal events (memory-backed, 5 min / 10K msg retention). */
export function ensureTerminalEventsStream(nc: NatsConnection): Promise<void> {
  return ensureStream(nc, {
    name: TERMINAL_EVENTS_STREAM,
    subjects: [ALL_TERMINAL_EVENTS],
    max_age_ns: FIVE_MINUTES_NS,
    max_msgs: 10_000,
    max_bytes: 64 * 1024 * 1024,
  })
}

/** Creates or updates the JetStream stream for chat message events (memory-backed, 30 min / 50K msg retention). */
export function ensureChatMessageStream(nc: NatsConnection): Promise<void> {
  return ensureStream(nc, {
    name: CHAT_MESSAGE_EVENTS_STREAM,
    subjects: [ALL_CHAT_MESSAGE_EVENTS],
    max_age_ns: THIRTY_MINUTES_NS,
    max_msgs: 50_000,
    max_bytes: 128 * 1024 * 1024,
  })
}

/** Creates or updates the JetStream stream for runner turn events (file-backed, 30 min / 50K msg retention). */
export function ensureRunnerEventsStream(nc: NatsConnection): Promise<void> {
  return ensureStream(nc, {
    name: RUNNER_EVENTS_STREAM,
    subjects: [ALL_RUNNER_EVENTS],
    max_age_ns: THIRTY_MINUTES_NS,
    max_msgs: 50_000,
    max_bytes: 128 * 1024 * 1024,
    storage: StorageType.File,
  })
}

/** Creates or updates the JetStream stream for project coordination events (file-backed, 24h / 100K msg retention). */
export function ensureWorkspaceCoordinationStream(nc: NatsConnection): Promise<void> {
  return ensureStream(nc, {
    name: WORKSPACE_COORDINATION_EVENTS_STREAM_NAME,
    subjects: [ALL_WORKSPACE_COORDINATION_EVENTS],
    max_age_ns: 24 * 60 * 60 * 1_000_000_000,
    max_msgs: 100_000,
    max_bytes: 256 * 1024 * 1024,
    storage: StorageType.File,
  })
}

/** Creates or updates the JetStream stream for sandbox events (memory-backed, 5 min / 5K msg retention). */
export function ensureSandboxEventsStream(nc: NatsConnection): Promise<void> {
  return ensureStream(nc, {
    name: SANDBOX_EVENTS_STREAM_NAME,
    subjects: [ALL_SANDBOX_EVENTS],
    max_age_ns: FIVE_MINUTES_NS,
    max_msgs: 5_000,
    max_bytes: 10 * 1024 * 1024,
  })
}

/**
 * Ensure the runner registry KV bucket exists.
 *
 * Called by the server (server-admin connection) at startup so that spawned
 * runners — whose NATS scope does not include STREAM.CREATE — can open the
 * bucket immediately without needing to create it themselves.
 *
 * Stage D: narrow the runner's $JS.API.> pub allow to the specific subjects
 * needed for kvm.open + kvStore.put once the exact set is empirically confirmed.
 */
export async function ensureRunnerRegistryBucket(nc: NatsConnection): Promise<void> {
  const kvm = new Kvm(nc)
  try {
    // Create with idempotent semantics: if the bucket already exists the
    // underlying STREAM.CREATE call is treated as an update by nats-server.
    await kvm.create(RUNNER_REGISTRY_BUCKET, {
      max_bytes: 1024 * 1024,
    })
    console.warn(LOG_PREFIX, `Runner registry KV bucket '${RUNNER_REGISTRY_BUCKET}' ready`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(LOG_PREFIX, `Runner registry KV bucket ensure failed: ${message}`)
    throw err
  }
}

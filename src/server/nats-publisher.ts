import type { NatsConnection } from "@nats-io/transport-node"
import { jetstream } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import type { SubscriptionTopic } from "../shared/protocol"
import { snapshotSubject, snapshotKvKey, terminalEventSubject, chatMessageSubject, KV_BUCKET } from "../shared/nats-subjects"
import { LOG_PREFIX } from "../shared/branding"
import { compressPayload } from "../shared/compression"
import type { ChatMessageEvent, TranscriptEntry } from "../shared/types"
import type { SessionStatus } from "../shared/types"
import type { DiscoveredProject } from "./discovery"
import type { EventStore } from "./event-store"
import { deriveChatSnapshot, deriveLocalWorkspacesSnapshot, deriveWorkspaceCoordinationSnapshot, deriveSidebarData, deriveAgentConfigSnapshot, deriveRepoListSnapshot, deriveWorkflowRunsSnapshot, deriveSandboxSnapshot, deriveTranscriptRenderUnits, TRANSCRIPT_RENDER_WINDOW_SIZE } from "./read-models"
import type { TerminalManager } from "./terminal-manager"
import type { UpdateManager } from "./update-manager"
import type { SkillCache } from "./skill-discovery"
import type { SessionOrchestrator } from "./orchestration"
import type { RuntimeRegistry } from "./runtime-registry"
import { deriveServerProviderCatalog } from "./provider-catalog"
import type { ProfileSnapshot } from "../shared/profile-types"
import type { ExtensionPreferencesSnapshot } from "../shared/extension-types"
import type { RunnerTeamSnapshot } from "../shared/runner-team-types"

const encoder = new TextEncoder()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const DEFAULT_UPDATE_SNAPSHOT = {
  currentVersion: "unknown",
  latestVersion: null,
  status: "idle",
  updateAvailable: false,
  lastCheckedAt: null,
  error: null,
  installAction: "restart",
} as const

export interface CreateNatsPublisherArgs {
  nc: NatsConnection
  store: EventStore
  agent: { getActiveStatuses(): Map<string, SessionStatus> }
  terminals: TerminalManager
  refreshDiscovery: () => Promise<DiscoveredProject[]>
  getDiscoveredProjects: () => DiscoveredProject[]
  machineDisplayName: string
  updateManager: UpdateManager | null
  skillCache?: SkillCache
  orchestrator?: SessionOrchestrator
  runtimeRegistry?: RuntimeRegistry
  hasActiveBlockingDelegations?: (chatId: string) => boolean
}

function deriveProfileSnapshot(store: EventStore): ProfileSnapshot {
  return {
    profiles: [...store.state.providerProfiles.values()],
    workspaceOverrides: [...store.state.workspaceProfileOverrides.values()].flatMap(
      (wsMap) => [...wsMap.values()],
    ),
  }
}

function deriveExtensionPreferencesSnapshot(store: EventStore): ExtensionPreferencesSnapshot {
  return {
    preferences: [...store.state.extensionPreferences.values()],
  }
}

function deriveRunnerTeamSnapshot(store: EventStore): RunnerTeamSnapshot {
  return {
    members: [...store.state.teamMembers.values()],
    runners: [...store.state.runnerLabels.values()],
  }
}

export async function createNatsPublisher(args: CreateNatsPublisherArgs) {
  const {
    nc,
    store,
    agent,
    terminals,
    getDiscoveredProjects,
    machineDisplayName,
    updateManager,
    skillCache,
    orchestrator,
    runtimeRegistry,
    hasActiveBlockingDelegations,
  } = args

  const js = jetstream(nc)
  const kv = await new Kvm(nc).create(KV_BUCKET)
  console.warn(LOG_PREFIX, `KV bucket "${KV_BUCKET}" ready`)

  const activeSubscriptions = new Map<string, SubscriptionTopic>()
  const lastJsonByKey = new Map<string, string>()

  function publishSnapshot(topic: SubscriptionTopic, data: unknown): void {
    const kvKey = snapshotKvKey(topic)
    const json = JSON.stringify(data)

    if (lastJsonByKey.get(kvKey) === json) return

    const payload = compressPayload(encoder.encode(json))

    try {
      nc.publish(snapshotSubject(topic), payload)
      lastJsonByKey.set(kvKey, json)
    } catch (error) {
      console.warn(LOG_PREFIX, `NATS publish failed on ${snapshotSubject(topic)}: ${errorMessage(error)}`)
    }

    void kv.put(kvKey, payload).catch((error) => {
      console.warn(LOG_PREFIX, `KV put failed on ${kvKey}: ${errorMessage(error)}`)
    })
  }

  async function computeSnapshot(topic: SubscriptionTopic): Promise<unknown> {
    switch (topic.type) {
      case "sidebar":
        return deriveSidebarData(store.state, agent.getActiveStatuses(), hasActiveBlockingDelegations)
      case "local-workspaces":
        return deriveLocalWorkspacesSnapshot(store.state, getDiscoveredProjects(), machineDisplayName)
      case "update":
        return updateManager?.getSnapshot() ?? DEFAULT_UPDATE_SNAPSHOT
      case "chat": {
        const chat = store.state.chatsById.get(topic.chatId)
        const project = chat ? store.state.workspacesById.get(chat.workspaceId) : undefined
        const skills = project && skillCache ? await skillCache.get(project.localPath) : []
        const messageCount = await store.getMessageCount(topic.chatId)
        const renderEntries = await store.getMessages(topic.chatId, {
          offset: Math.max(0, messageCount - TRANSCRIPT_RENDER_WINDOW_SIZE),
          limit: TRANSCRIPT_RENDER_WINDOW_SIZE,
        })
        const activeStatus = agent.getActiveStatuses().get(topic.chatId)
        const providerCatalog = runtimeRegistry
          ? deriveServerProviderCatalog(runtimeRegistry.getProviderCapabilities("claude"))
          : undefined
        return deriveChatSnapshot(
          store.state,
          agent.getActiveStatuses(),
          topic.chatId,
          messageCount,
          skills,
          hasActiveBlockingDelegations,
          deriveTranscriptRenderUnits(renderEntries, activeStatus),
          providerCatalog,
        )
      }
      case "terminal":
        return terminals.getSnapshot(topic.terminalId)
      case "orchestration":
        return orchestrator?.getHierarchy(topic.chatId) ?? { children: [] }
      case "workspace":
        return deriveWorkspaceCoordinationSnapshot(store.state, topic.workspaceId)
      case "agent-config":
        return deriveAgentConfigSnapshot(store.state, topic.workspaceId)
      case "repos":
        return deriveRepoListSnapshot(store.state, topic.workspaceId)
      case "workflow-runs":
        return deriveWorkflowRunsSnapshot(store.state, topic.workspaceId)
      case "sandbox-status":
        return deriveSandboxSnapshot(store.state, topic.workspaceId)
      case "runtime-status":
        return runtimeRegistry?.getSnapshot() ?? { runtimes: [] }
      case "profiles":
        return deriveProfileSnapshot(store)
      case "extension-preferences":
        return deriveExtensionPreferencesSnapshot(store)
      case "runner-teams":
        return deriveRunnerTeamSnapshot(store)
      default: {
        const _exhaustive: never = topic
        throw new Error(`Unknown topic type: ${(_exhaustive as SubscriptionTopic).type}`)
      }
    }
  }

  function addSubscription(subscriptionId: string, topic: SubscriptionTopic): void {
    activeSubscriptions.set(subscriptionId, topic)
  }

  function removeSubscription(subscriptionId: string): void {
    const topic = activeSubscriptions.get(subscriptionId)
    activeSubscriptions.delete(subscriptionId)

    // Prune dedup cache if no remaining subscriptions reference this key
    if (topic) {
      const key = snapshotKvKey(topic)
      const stillTracked = [...activeSubscriptions.values()].some((t) => snapshotKvKey(t) === key)
      if (!stillTracked) {
        lastJsonByKey.delete(key)
      }
    }
  }

  async function getSnapshot(topic: SubscriptionTopic): Promise<unknown> {
    const data = await computeSnapshot(topic)
    publishSnapshot(topic, data)
    return data
  }

  async function broadcastSnapshots(changedTypes?: ReadonlySet<string>): Promise<void> {
    const published = new Set<string>()
    for (const [, topic] of activeSubscriptions) {
      if (changedTypes && !changedTypes.has(topic.type)) continue
      const key = snapshotKvKey(topic)
      if (published.has(key)) continue
      published.add(key)
      publishSnapshot(topic, await computeSnapshot(topic))
    }
    orchestrator?.pruneTombstones()
  }

  function publishChatMessage(chatId: string, entry: TranscriptEntry): void {
    const subject = chatMessageSubject(chatId)
    const event: ChatMessageEvent = { chatId, entry }
    const payload = compressPayload(encoder.encode(JSON.stringify(event)))
    void js.publish(subject, payload).catch((error) => {
      console.warn(LOG_PREFIX, `JetStream publish failed on ${subject}: ${errorMessage(error)}`)
    })
  }

  const disposeTerminalEvents = terminals.onEvent((event) => {
    const subject = terminalEventSubject(event.terminalId)
    const payload = compressPayload(encoder.encode(JSON.stringify(event)))
    void js.publish(subject, payload).catch((error) => {
      console.warn(LOG_PREFIX, `JetStream publish failed on ${subject}: ${errorMessage(error)}`)
    })
  })

  const disposeUpdateEvents = updateManager?.onChange(() => {
    publishSnapshot({ type: "update" }, updateManager.getSnapshot())
  }) ?? (() => {})

  // Periodic runtime health checks — updates runtime-status snapshot
  const healthCheckInterval = runtimeRegistry
    ? setInterval(async () => {
        try {
          for (const provider of ["claude", "codex"] as const) {
            await runtimeRegistry.healthCheck(provider)
          }
          publishSnapshot({ type: "runtime-status" }, runtimeRegistry.getSnapshot())
        } catch (error) {
          console.warn(LOG_PREFIX, `Runtime health check failed: ${errorMessage(error)}`)
        }
      }, 60_000)
    : null

  if (runtimeRegistry) {
    void runtimeRegistry.probeCapabilities("claude").then(() => {
      publishSnapshot({ type: "runtime-status" }, runtimeRegistry.getSnapshot())
      broadcastSnapshots()
    })
  }

  return {
    addSubscription,
    removeSubscription,
    getSnapshot,
    broadcastSnapshots,
    publishChatMessage,
    dispose() {
      disposeTerminalEvents()
      disposeUpdateEvents()
      if (healthCheckInterval) clearInterval(healthCheckInterval)
    },
  }
}

export type NatsPublisher = Awaited<ReturnType<typeof createNatsPublisher>>

import type { NatsConnection } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import {
  RUNNER_REGISTRY_BUCKET,
  isProtocolSupported,
  runnerLivenessState,
  type RunnerCapabilities,
  type RunnerLivenessState,
  type RunnerRegistration,
} from "../shared/runner-protocol"
import type { AgentProvider } from "../shared/types"

// ── Types ────────────────────────────────────────────────────────────────────

export type RunnerDescriptor = {
  runnerId: string
  state: RunnerLivenessState
  capabilities: RunnerCapabilities | null
  protocolVersion: number | null
  /** True when protocolVersion is null or outside SUPPORTED_RANGE. Fail-closed. */
  incompatible: boolean
  lastSeenAt: number | null
  pid: number | null
  /** Carried from reg.ownerId if present; not yet enforced (deferred to post-PR2). */
  ownerId: string | null
  /** True when runnerId matches the server-spawned shared runner. */
  isShared: boolean
}

export type RunnerSelection =
  | { kind: "selected"; runnerId: string; sticky: boolean }
  | { kind: "needs_pick"; candidates: RunnerDescriptor[]; reason: "ambiguous" | "sticky_offline" }
  | { kind: "unavailable"; reason: string }

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Build a descriptor from a raw KV entry. Exported for unit tests (no NATS needed).
 */
export function buildDescriptors(
  entries: { key: string; reg: RunnerRegistration }[],
  sharedId: string | null,
  now: number,
): RunnerDescriptor[] {
  return entries.map(({ key, reg }) => {
    const lastSeenAt = reg.lastSeenAt ?? null
    const state = runnerLivenessState(lastSeenAt, now)
    const capabilities = reg.capabilities ?? null
    // Defensive: missing protocolVersion treated as incompatible (fail-closed).
    const protocolVersion = (reg as { protocolVersion?: number }).protocolVersion ?? null
    const incompatible =
      protocolVersion === null ? true : !isProtocolSupported(protocolVersion)
    return {
      runnerId: key,
      state,
      capabilities,
      protocolVersion,
      incompatible,
      lastSeenAt,
      pid: reg.pid ?? null,
      ownerId: (reg as { ownerId?: string }).ownerId ?? null,
      isShared: key === sharedId,
    }
  })
}

/**
 * Returns true when a descriptor is eligible to handle `provider`.
 *
 * Eligibility rules:
 *  - state !== "offline"   (liveness, fail-closed)
 *  - !incompatible         (protocol compat, fail-closed)
 *  - capabilities === null OR capabilities.providers.includes(provider)
 *    (capability, fail-open: pre-PR4 runners without capabilities are assumed capable)
 *
 * Exported for unit tests.
 */
export function eligibleFor(provider: AgentProvider): (d: RunnerDescriptor) => boolean {
  return (d) =>
    d.state !== "offline" &&
    !d.incompatible &&
    (d.capabilities === null || d.capabilities.providers.includes(provider))
}

/**
 * Sort candidates for display: non-shared first, then shared; within each group
 * by lastSeenAt descending (nulls last).
 */
function sortCandidates(candidates: RunnerDescriptor[]): RunnerDescriptor[] {
  return [...candidates].sort((a, b) => {
    // Shared runners go last
    if (a.isShared !== b.isShared) return a.isShared ? 1 : -1
    // Within group: most-recently-seen first; nulls go to the end
    const aTs = a.lastSeenAt ?? -Infinity
    const bTs = b.lastSeenAt ?? -Infinity
    return bTs - aTs
  })
}

/**
 * Pure selection logic. Exported for unit tests.
 *
 * Policy (deterministic, in order):
 *  1. eligible = descriptors.filter(eligibleFor(provider))
 *  2. preferredRunnerId present:
 *     a. eligible contains preferred → { selected, sticky: true }
 *     b. otherwise (preferred exists in descriptors OR is gone) → { needs_pick, sticky_offline }
 *  3. eligible.length === 0 → { unavailable }
 *  4. eligible.length === 1 → { selected, sticky: false }
 *  5. else → { needs_pick, ambiguous }
 */
export function selectFrom(
  descriptors: RunnerDescriptor[],
  req: {
    provider: AgentProvider
    preferredRunnerId?: string | null
    now?: number
  },
): RunnerSelection {
  const { provider, preferredRunnerId } = req
  const eligible = descriptors.filter(eligibleFor(provider))
  const orderedCandidates = sortCandidates(eligible)

  if (preferredRunnerId) {
    const hit = eligible.find((d) => d.runnerId === preferredRunnerId)
    if (hit) {
      return { kind: "selected", runnerId: hit.runnerId, sticky: true }
    }
    // Preferred runner exists in any state OR is gone entirely → needs a new pick.
    return {
      kind: "needs_pick",
      candidates: orderedCandidates,
      reason: "sticky_offline",
    }
  }

  if (eligible.length === 0) {
    return {
      kind: "unavailable",
      reason: `No online runner for "${provider}" — pair or start a runner.`,
    }
  }

  if (eligible.length === 1) {
    return { kind: "selected", runnerId: eligible[0].runnerId, sticky: false }
  }

  return { kind: "needs_pick", candidates: orderedCandidates, reason: "ambiguous" }
}

// ── RunnerRouter ─────────────────────────────────────────────────────────────

const decoder = new TextDecoder()

export class RunnerRouter {
  private readonly nc: NatsConnection
  private readonly sharedRunnerId: () => string | null

  constructor(opts: { nc: NatsConnection; sharedRunnerId: () => string | null }) {
    this.nc = opts.nc
    this.sharedRunnerId = opts.sharedRunnerId
  }

  /**
   * Enumerate all registered runners from the KV bucket, annotated with
   * liveness, compat, and isShared. Returns [] on missing/empty bucket.
   */
  async list(now = Date.now()): Promise<RunnerDescriptor[]> {
    const entries: { key: string; reg: RunnerRegistration }[] = []
    try {
      const kvm = new Kvm(this.nc)
      const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
      const keys = await kvStore.keys()
      for await (const key of keys) {
        const entry = await kvStore.get(key)
        if (!entry) continue
        try {
          const reg = JSON.parse(decoder.decode(entry.value)) as RunnerRegistration
          entries.push({ key, reg })
        } catch (e) {
          console.warn(`[RunnerRouter] skipping corrupt KV entry "${key}":`, e instanceof Error ? e.message : String(e))
          continue
        }
      }
    } catch {
      // Bucket missing or NATS not ready — return what we have (possibly empty).
    }
    return buildDescriptors(entries, this.sharedRunnerId(), now)
  }

  /**
   * Fetch a single runner descriptor by id. Returns null if not found.
   */
  async get(runnerId: string, now = Date.now()): Promise<RunnerDescriptor | null> {
    const all = await this.list(now)
    return all.find((d) => d.runnerId === runnerId) ?? null
  }

  /**
   * Select a runner for `provider`, honoring sticky preference when eligible.
   * See `selectFrom` for the full deterministic policy.
   */
  async select(req: {
    provider: AgentProvider
    preferredRunnerId?: string | null
    now?: number
  }): Promise<RunnerSelection> {
    const now = req.now ?? Date.now()
    const descriptors = await this.list(now)
    return selectFrom(descriptors, req)
  }
}

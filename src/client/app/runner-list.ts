/**
 * Pure helpers for the Runners-tab live list (US-RLL).
 *
 * The list is fed by the public `GET /health` `runners[]`, whose elements are
 * the server's `RunnerDescriptor`. We keep only the fields the UI needs and the
 * filtering/diff logic here so it can be unit-tested without a DOM or a server.
 */

/** Subset of the server `RunnerDescriptor` (see src/server/runner-router.ts) that /health returns. */
export interface HealthRunner {
  runnerId: string
  state: "online" | "degraded" | "offline"
  capabilities: { providers: string[] } | null
  incompatible: boolean
  lastSeenAt: number | null
  pid: number | null
  isShared: boolean
}

/**
 * A runner is "relevant" to show in the live list when it is reachable now:
 * online or degraded, and protocol-compatible. Offline/incompatible entries are
 * stale KV tombstones (the registry has no TTL yet) and would just be noise.
 */
export function filterRelevantRunners(runners: HealthRunner[]): HealthRunner[] {
  return runners
    .filter((r) => !r.incompatible && r.state !== "offline")
    .sort((a, b) => {
      // online before degraded, then by runnerId for stability. We deliberately
      // do NOT sort by lastSeenAt — it ticks with every heartbeat (~2s) and would
      // reorder the list visibly on each poll. State and id are stable.
      if (a.state !== b.state) return a.state === "online" ? -1 : 1
      return a.runnerId.localeCompare(b.runnerId)
    })
}

/**
 * Runner ids present in `current` that were not in `baseline`. Used to flag a
 * just-paired runner: snapshot the relevant ids when a pairing code is generated,
 * then any new relevant id is "newly connected".
 */
export function newlyConnectedIds(
  baseline: ReadonlySet<string>,
  current: HealthRunner[],
): Set<string> {
  const out = new Set<string>()
  for (const r of current) {
    if (!baseline.has(r.runnerId)) out.add(r.runnerId)
  }
  return out
}

/** Short display name: last two id segments (runner-1779…-71677 -> 1779…-71677 tail). */
export function runnerShortName(runnerId: string): string {
  const parts = runnerId.split("-")
  return parts.length > 1 ? parts.slice(-2).join("-") : runnerId
}

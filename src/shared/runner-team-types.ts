/**
 * Runner team types (US-RTN).
 *
 * Operator-managed, display-only metadata for remote runners:
 *  - TeamMember: a flat "member" the single operator manages (names only — no
 *    auth, no accounts, no permissions).
 *  - RunnerLabel: a human name + optional member assignment, keyed by runnerId.
 *
 * Persisted as EventStore events (see events.ts `RunnerTeamEvent`), mirroring
 * provider profiles. This is intentionally separate from the runner-owned NATS
 * KV registry (`runtime_runner_registry`), which the runner rewrites on every
 * heartbeat and would clobber any server-set fields. Routing/eligibility never
 * reads this data.
 */

/** A member of the operator's local "team". Names only — not an authenticated user. */
export interface TeamMember {
  id: string
  name: string
}

/** Human label + member assignment for a single runner. Upserted by runnerId. */
export interface RunnerLabel {
  runnerId: string
  /** Operator-given runner name. null ⇒ UI falls back to the short runnerId. */
  name: string | null
  /** Assigned member id, or null when unassigned. */
  memberId: string | null
  /** Unix epoch ms of the last label write. */
  updatedAt: number
}

/** Stored runner-label record (currently identical to RunnerLabel; kept distinct for parity with ProviderProfileRecord). */
export type RunnerLabelRecord = RunnerLabel

/** Snapshot broadcast on the `runner-teams` subscription topic. */
export interface RunnerTeamSnapshot {
  members: TeamMember[]
  runners: RunnerLabel[]
}

/**
 * Resolve a runner's display name: the operator label when set, else a short
 * form of the runnerId (last two dash-separated segments). Pure — unit-tested.
 */
export function resolveRunnerName(
  runnerId: string,
  labels: ReadonlyMap<string, RunnerLabel> | readonly RunnerLabel[],
): string {
  const label = Array.isArray(labels)
    ? labels.find((l) => l.runnerId === runnerId)
    : (labels as ReadonlyMap<string, RunnerLabel>).get(runnerId)
  const name = label?.name?.trim()
  if (name) return name
  const parts = runnerId.split("-")
  return parts.length > 1 ? parts.slice(-2).join("-") : runnerId
}

/** Resolve the member assigned to a runner, or null. Pure. */
export function resolveRunnerMember(
  runnerId: string,
  labels: ReadonlyMap<string, RunnerLabel> | readonly RunnerLabel[],
  members: ReadonlyMap<string, TeamMember> | readonly TeamMember[],
): TeamMember | null {
  const label = Array.isArray(labels)
    ? labels.find((l) => l.runnerId === runnerId)
    : (labels as ReadonlyMap<string, RunnerLabel>).get(runnerId)
  if (!label?.memberId) return null
  const memberId = label.memberId
  return Array.isArray(members)
    ? (members.find((m) => m.id === memberId) ?? null)
    : ((members as ReadonlyMap<string, TeamMember>).get(memberId) ?? null)
}

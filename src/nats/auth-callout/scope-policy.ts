/**
 * Subject-scope policy for NATS auth-callout (Stage A, PR1).
 *
 * Three connection classes are defined in design.md; this module is the
 * single source of truth for what each class may publish and subscribe.
 * Pure — no I/O, fully unit-testable.
 */

/** The three connection classes defined by PR1. */
export type ConnectionClass = "server-admin" | "ui-client" | "runner"

/** Resolved identity, output of credential validation in the responder. */
export type ResolvedIdentity =
  | { class: "server-admin" }
  | { class: "ui-client" }
  | { class: "runner"; runnerId: string }

/** Allow/deny lists for pub and sub that go into the signed user JWT. */
export interface SubjectScope {
  pub: { allow: string[]; deny: string[] }
  sub: { allow: string[]; deny: string[] }
}

// ── KV / JetStream subject patterns ─────────────────────────────────────────
//
// KV write to a specific key in bucket B maps to:
//   $KV.B.<key>          — the client publishes to this subject
// KV reads and JetStream API calls use:
//   $JS.API.>            — broad JetStream API
//   $KV.>               — all KV subjects (reads/meta)
//
// For a runner scoped to its own registry key, we allow publish on its key
// and deny publish on any other key in the registry bucket.

/** KV bucket for runner registration (from runner-protocol.ts). */
const RUNNER_REGISTRY_BUCKET = "runtime_runner_registry"

/** Build the runner's own KV key subject. */
function runnerOwnKvSubject(runnerId: string): string {
  return `$KV.${RUNNER_REGISTRY_BUCKET}.${runnerId}`
}


// ── Policy factory ───────────────────────────────────────────────────────────

/**
 * Return the publish/subscribe allow-deny scope for a resolved identity.
 * The caller signs these into a user JWT; NATS enforces them.
 */
export function permissionsFor(identity: ResolvedIdentity): SubjectScope {
  switch (identity.class) {
    case "server-admin":
      return serverAdminScope()
    case "ui-client":
      return uiClientScope()
    case "runner":
      return runnerScope(identity.runnerId)
  }
}

// ── Per-class policies (match design.md exactly) ─────────────────────────────

function serverAdminScope(): SubjectScope {
  return {
    pub: {
      allow: [
        "runtime.>",    // all runtime subjects
        "$JS.API.>",    // JetStream API
        "$KV.>",        // all KV operations
        "_INBOX.>",     // inbox replies
      ],
      deny: [],
    },
    sub: {
      allow: [
        "runtime.>",
        "$JS.API.>",
        "$KV.>",
        "_INBOX.>",
        "$SYS.REQ.USER.AUTH", // callout responder subscription
      ],
      deny: [],
    },
  }
}

function uiClientScope(): SubjectScope {
  // ui-client may only publish to runtime.cmd.> (UI commands).
  // runtime.runner.cmd.> is NOT in the allow list → denied by NATS by default.
  // No deny list needed: NATS's allow-only model covers this.
  return {
    pub: {
      allow: [
        "runtime.cmd.>",  // UI commands only (runner cmds NOT included)
        "_INBOX.>",
      ],
      deny: [],
    },
    sub: {
      allow: [
        "runtime.runner.evt.>",  // runner events
        "runtime.evt.>",         // general events
        "runtime.snap.>",        // snapshots
        "_INBOX.>",
      ],
      deny: [],
    },
  }
}

function runnerScope(runnerId: string): SubjectScope {
  const ownKv = runnerOwnKvSubject(runnerId)

  // NATS permission evaluation: if a subject matches an allow pattern, it is
  // allowed. If it matches a deny pattern, it is denied regardless of allow.
  // So for runner isolation we use ALLOW-only lists (no deny needed for sub):
  //  - allow only the specific runnerId's cmd subject (not a wildcard)
  //  - this naturally excludes all other runner cmd subjects
  //
  // For KV writes (pub): allow the specific key, deny the bucket wildcard so
  // other keys are blocked. The own key is listed in allow first — but NATS
  // deny still wins when both match. We rely on a specific-allow narrower than
  // the deny wildcard to NOT match each other: ownKv is the full key (no
  // wildcard), and the deny is "$KV.BUCKET.>" which DOES match ownKv.
  // So we can't use a wildcard deny for the KV bucket.
  //
  // Instead: allow ONLY the exact own KV key (specific allow), and do NOT add
  // a deny wildcard. Other KV subjects are simply not in the allow list →
  // denied by default (no-allow = deny in NATS).

  return {
    pub: {
      allow: [
        `runtime.runner.heartbeat.${runnerId}`, // its own heartbeat
        "runtime.runner.evt.>",                 // runner events (any chatId)
        ownKv,                                  // write its own registry key only
        "_INBOX.>",
        // STAGE D TODO: narrow to the minimal $JS.API.* subjects needed for
        // kvm.open(RUNNER_REGISTRY_BUCKET) + kvStore.put(runnerId, ...).
        // The server pre-creates the KV bucket so the runner never needs
        // STREAM.CREATE. The remaining subjects (STREAM.INFO, CONSUMER.CREATE)
        // are bucket-scoped but the library may use unpredictable subject forms.
        // Confirmed empirically with -DV trace and narrow in Stage D.
        // This is a PILOT allowance — a runner can publish to any JS API subject,
        // including ones for other streams. Flag for Stage D security review.
        "$JS.API.>",
      ],
      deny: [],
    },
    sub: {
      allow: [
        `runtime.runner.cmd.${runnerId}.>`, // its own command subject only
        "_INBOX.>",
        "$JS.API.>",                        // JetStream reads / consumer create
        `$KV.${RUNNER_REGISTRY_BUCKET}.>`, // KV reads (for its own entry)
      ],
      deny: [],
    },
  }
}

// ── Helpers used by tests ─────────────────────────────────────────────────────

/** Return the KV key subject a runner should be able to write. */
export function runnerKvKeySubject(runnerId: string): string {
  return runnerOwnKvSubject(runnerId)
}

/** Return the cmd subject for a given runnerId. */
export function runnerCmdWildcard(runnerId: string): string {
  return `runtime.runner.cmd.${runnerId}.>`
}

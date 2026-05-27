/**
 * Runner credential store (PR2 Stage 2).
 *
 * Reads and writes the durable runner credential to
 * `<TINKARIA_RUNNER_HOME>/runner-secret.json` (default: `~/.tinkaria/`).
 * The file is written atomically (tmp + rename) with mode 0600.
 *
 * The credential is a PR1 callout token minted at pairing time:
 *   { runnerId, token, natsUrl, natsWsUrl, pairedAt }
 *
 * Env-var TINKARIA_RUNNER_HOME overrides the default directory so that
 * tests and multiple local runners can use isolated locations.
 */

import { join, resolve } from "node:path"
import { chmodSync, mkdirSync, renameSync } from "node:fs"
import { homedir } from "node:os"

export interface RunnerCredential {
  runnerId: string
  /** PR1 callout credential token (long-lived, self-verifying). Never log in full. */
  token: string
  natsUrl: string
  natsWsUrl: string
  /** Unix epoch ms when the runner was paired. */
  pairedAt: number
}

const CREDENTIAL_FILE = "runner-secret.json"

/**
 * Resolve the runner home directory (overridable via TINKARIA_RUNNER_HOME).
 * The env var is operator-controlled config (like HOME) — it may legitimately
 * point anywhere, so we don't restrict it; we normalize it to an absolute path
 * for predictability. The directory is created 0700 (see writeRunnerCredential)
 * so the secret file's parent isn't world-traversable.
 */
function runnerHomeDir(): string {
  const raw = process.env.TINKARIA_RUNNER_HOME ?? join(homedir(), ".tinkaria")
  return resolve(raw)
}

function credentialPath(): string {
  return join(runnerHomeDir(), CREDENTIAL_FILE)
}

/**
 * Write the runner credential to disk atomically with mode 0600.
 * Creates the directory if it does not exist.
 */
export async function writeRunnerCredential(cred: RunnerCredential): Promise<void> {
  const dir = runnerHomeDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })

  const dest = credentialPath()
  const tmp = `${dest}.tmp.${process.pid}`

  await Bun.write(tmp, JSON.stringify(cred, null, 2) + "\n")
  chmodSync(tmp, 0o600)
  renameSync(tmp, dest)
  // chmod again after rename in case umask widened it on some platforms
  chmodSync(dest, 0o600)
}

/**
 * Read the runner credential from disk.
 * Returns null if the file does not exist (runner not yet paired).
 */
export async function readRunnerCredential(): Promise<RunnerCredential | null> {
  const file = Bun.file(credentialPath())
  if (!(await file.exists())) return null
  const text = await file.text()
  return JSON.parse(text) as RunnerCredential
}

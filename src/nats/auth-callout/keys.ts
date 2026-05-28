/**
 * Callout signing-key management (Stage A, PR1).
 *
 * The auth-callout requires two nkey pairs:
 *   - An **account key pair** — the callout issuer account (public key goes into
 *     the nats-server config; the seed is held by the responder to sign user JWTs).
 *   - An **auth-service key pair** — the user listed in `auth_users` whose
 *     connection bypasses the callout (required by NATS auth-callout spec).
 *
 * Both seeds are stored alongside `nats.token` in NATS_DATA_DIR (same on-disk
 * trust boundary; gitignored). The server reads them at startup; key rotation
 * is a documented follow-up.
 */

import { join } from "node:path"
import { mkdirSync, renameSync, chmodSync } from "node:fs"
import { createAccount, createUser, fromSeed } from "@nats-io/nkeys"
import type { KeyPair } from "@nats-io/nkeys"

const ACCOUNT_SEED_FILE = "nats.callout-account.seed"
const AUTH_USER_SEED_FILE = "nats.callout-auth-user.seed"
const TOKEN_SECRET_FILE = "nats.callout-token.secret"

/** Loaded callout key material. */
export interface CalloutKeys {
  /** KeyPair for the callout issuer account (signs user JWTs). */
  accountKp: KeyPair
  /** Public key of the account (goes into nats-server config). */
  accountPublicKey: string
  /** KeyPair for the auth-service user (bypasses callout). */
  authUserKp: KeyPair
  /** Public key of the auth-service user (goes into nats-server config). */
  authUserPublicKey: string
  /**
   * 32-byte shared secret used to mint and verify stateless credential tokens
   * (Stage B). Both the server process and the daemon child load this from disk.
   */
  tokenSecret: Uint8Array
}

async function readOrCreateSeed(
  seedPath: string,
  generator: () => KeyPair
): Promise<string> {
  const file = Bun.file(seedPath)
  if (await file.exists()) {
    const seed = (await file.text()).trim()
    if (seed.length > 0) return seed
  }

  const kp = generator()
  const seed = Buffer.from(kp.getSeed()).toString()
  const tmp = `${seedPath}.tmp.${process.pid}`
  await Bun.write(tmp, seed + "\n")
  renameSync(tmp, seedPath) // atomic
  chmodSync(seedPath, 0o600) // owner-read/write only
  return seed
}

async function readOrCreateTokenSecret(secretPath: string): Promise<Uint8Array> {
  const file = Bun.file(secretPath)
  if (await file.exists()) {
    const hex = (await file.text()).trim()
    if (hex.length === 64) return new Uint8Array(Buffer.from(hex, "hex"))
  }

  const secret = new Uint8Array(32)
  crypto.getRandomValues(secret)
  const hex = Buffer.from(secret).toString("hex")
  const tmp = `${secretPath}.tmp.${process.pid}`
  await Bun.write(tmp, hex + "\n")
  renameSync(tmp, secretPath) // atomic
  chmodSync(secretPath, 0o600) // owner-read/write only
  return secret
}

/**
 * Ensure callout key material exists in `dataDir`.
 * Generates both pairs and the token secret on first call; subsequent calls load from disk.
 * Safe for single-writer use (the NATS daemon); not safe for concurrent writers.
 */
export async function ensureCalloutKeys(dataDir: string): Promise<CalloutKeys> {
  mkdirSync(dataDir, { recursive: true })

  const accountSeedPath = join(dataDir, ACCOUNT_SEED_FILE)
  const authUserSeedPath = join(dataDir, AUTH_USER_SEED_FILE)
  const tokenSecretPath = join(dataDir, TOKEN_SECRET_FILE)

  const accountSeed = await readOrCreateSeed(accountSeedPath, createAccount)
  const authUserSeed = await readOrCreateSeed(authUserSeedPath, createUser)
  const tokenSecret = await readOrCreateTokenSecret(tokenSecretPath)

  const accountKp = fromSeed(Buffer.from(accountSeed.trim()))
  const authUserKp = fromSeed(Buffer.from(authUserSeed.trim()))

  return {
    accountKp,
    accountPublicKey: accountKp.getPublicKey(),
    authUserKp,
    authUserPublicKey: authUserKp.getPublicKey(),
    tokenSecret,
  }
}

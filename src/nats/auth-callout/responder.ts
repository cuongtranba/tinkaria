/**
 * Auth-callout responder (Stage B, PR1).
 *
 * Subscribes to $SYS.REQ.USER.AUTH. For each request:
 *  1. Decode the AuthorizationRequest JWT from NATS.
 *  2. Validate the credential in connect_opts.auth_token via verifyCredentialToken.
 *  3. Resolve the connection class (and runnerId for runner class).
 *  4. Mint a scoped user JWT and respond with a signed AuthorizationResponse.
 *  5. Audit every decision (grant/deny).
 *
 * The responding connection itself uses the auth-service nkey (authUserKp) and
 * bypasses the callout, per the NATS auth_callout spec.
 *
 * Stage B: replaced in-memory credential registry with stateless HMAC-signed
 * tokens (verifyCredentialToken). No registration step; both the server process
 * (issuer) and this daemon child (verifier) share only the on-disk token secret.
 */

import { connect, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { nkeyAuthenticator } from "@nats-io/nats-core"
import {
  encodeUser,
  encodeAuthorizationResponse,
  decode,
  Algorithms,
  fromPublic,
  createUser,
} from "@nats-io/jwt"
import type { AuthorizationRequest } from "@nats-io/jwt"
import type { KeyPair } from "@nats-io/nkeys"
import { permissionsFor } from "./scope-policy"
import type { ResolvedIdentity } from "./scope-policy"
import { verifyCredentialToken } from "./token"

const CALLOUT_SUBJECT = "$SYS.REQ.USER.AUTH"

// ── Responder ─────────────────────────────────────────────────────────────────

export interface ResponderOptions {
  /** NATS URL to connect to (TCP). */
  natsUrl: string
  /** KeyPair for the auth-service user (bypasses callout). */
  authUserKp: KeyPair
  /** KeyPair for the callout issuer account (signs user JWTs). */
  accountKp: KeyPair
  /** Public key of the callout account (needed for encodeUser issuer_account). */
  accountPublicKey: string
  /**
   * Account name as declared in the nats-server config accounts block.
   * This becomes the `aud` (audience) of the issued user JWT so NATS knows
   * which account to place the connection in.
   */
  accountName?: string
  /**
   * 32-byte shared secret loaded from NATS_DATA_DIR by the daemon child.
   * Used to verify stateless credential tokens without any in-memory registry.
   */
  tokenSecret: Uint8Array
}

export class CalloutResponder {
  private nc: NatsConnection | null = null
  private sub: Subscription | null = null
  private readonly opts: ResponderOptions

  constructor(opts: ResponderOptions) {
    this.opts = opts
  }

  /**
   * Connect to NATS as the auth-service user (bypasses callout) and
   * start the subscription loop.
   */
  async start(): Promise<void> {
    const { authUserKp, natsUrl } = this.opts

    // Connect using the auth-service nkey (bypasses the callout per NATS spec).
    // nkeyAuthenticator takes the seed bytes; the server verifies the public key
    // against auth_users in the config.
    this.nc = await connect({
      servers: natsUrl,
      authenticator: nkeyAuthenticator(authUserKp.getSeed()),
    })

    this.sub = this.nc.subscribe(CALLOUT_SUBJECT)
    void this.listenLoop().catch((err) => {
      console.error("[nats-callout] listenLoop fatal:", err)
    })
  }

  /** Stop the responder and drain the NATS connection. */
  async stop(): Promise<void> {
    this.sub?.unsubscribe()
    if (this.nc) {
      try { await this.nc.drain() } catch { /* ignore drain errors on shutdown */ }
      this.nc = null
    }
  }

  private async listenLoop(): Promise<void> {
    if (!this.sub) return
    for await (const msg of this.sub) {
      await this.handleCallout(msg)
    }
  }

  private async handleCallout(msg: { data: Uint8Array; respond: (data: Uint8Array) => void }): Promise<void> {
    const { accountKp, accountPublicKey, accountName = "CALLOUT_ACCOUNT" } = this.opts

    // The callout request body is a JWT (not plain JSON).
    // Decode it to get the AuthorizationRequest payload from the `nats` claim.
    let req: AuthorizationRequest
    try {
      const jwt = new TextDecoder().decode(msg.data)
      const claims = decode<AuthorizationRequest>(jwt)
      req = claims.nats as unknown as AuthorizationRequest
    } catch (err) {
      this.audit("deny", "unparseable-request", null, `decode error: ${err}`)
      await this.respondError(msg, accountKp, null, "invalid authorization request")
      return
    }

    const userNkey = req.user_nkey
    const serverNkey = req.server_id.id
    const presentedToken = req.connect_opts?.auth_token

    // Verify the stateless signed credential token.
    const identity = await verifyCredentialToken(presentedToken, this.opts.tokenSecret)
    if (!identity) {
      this.audit("deny", userNkey, null, "unknown or invalid credential")
      await this.respondError(msg, accountKp, serverNkey, "unknown credential")
      return
    }
    const scope = permissionsFor(identity)

    // Mint a fresh user keypair for this connection (the JWT subject).
    // The user nkey from the request is the connecting client's key;
    // we use fromPublic to get a Key that encodeUser can use as ukp.
    let userKey: ReturnType<typeof fromPublic>
    try {
      userKey = fromPublic(userNkey)
    } catch (err) {
      this.audit("deny", userNkey, identity, `invalid user nkey: ${err}`)
      await this.respondError(msg, accountKp, serverNkey, "invalid user nkey")
      return
    }

    // Encode the scoped user JWT.
    // The `aud` field must be the account name from the nats-server config so
    // NATS knows which account to place this connection in.
    let userJwt: string
    try {
      userJwt = await encodeUser(
        connectionClassName(identity),
        userKey,
        accountKp, // issuer — the account key pair
        {
          pub: scope.pub,
          sub: scope.sub,
        },
        { algorithm: Algorithms.v2, aud: accountName }
      )
    } catch (err) {
      this.audit("deny", userNkey, identity, `jwt encode failed: ${err}`)
      await this.respondError(msg, accountKp, serverNkey, "internal error minting JWT")
      return
    }

    // Build and sign the authorization response.
    try {
      const serverKp = fromPublic(serverNkey)
      const responseJwt = await encodeAuthorizationResponse(
        userKey,
        serverKp,
        accountKp,
        { jwt: userJwt },
        { algorithm: Algorithms.v2 }
      )

      this.audit("grant", userNkey, identity, "ok")
      msg.respond(new TextEncoder().encode(responseJwt))
    } catch (err) {
      this.audit("deny", userNkey, identity, `response encode failed: ${err}`)
      await this.respondError(msg, accountKp, serverNkey, "internal error building response")
    }
  }

  private async respondError(
    msg: { respond: (data: Uint8Array) => void },
    accountKp: KeyPair,
    serverNkey: string | null,
    reason: string
  ): Promise<void> {
    try {
      // For error responses we need a server key; if we don't have one, create
      // a throwaway keypair (NATS only needs a valid structure for the error path).
      const serverKp = serverNkey
        ? fromPublic(serverNkey)
        : createUser()

      // The user key in an error response is also a throwaway.
      const throwawayUser = createUser()

      const responseJwt = await encodeAuthorizationResponse(
        throwawayUser,
        serverKp,
        accountKp,
        { error: reason },
        { algorithm: Algorithms.v2 }
      )
      msg.respond(new TextEncoder().encode(responseJwt))
    } catch {
      // Last resort: send empty bytes; NATS will treat as rejection.
      msg.respond(new Uint8Array(0))
    }
  }

  private audit(
    decision: "grant" | "deny",
    userNkey: string | null,
    identity: ResolvedIdentity | null,
    detail: string
  ): void {
    const ts = new Date().toISOString()
    const cls = identity ? connectionClassName(identity) : "unknown"
    const rid = identity?.class === "runner" ? identity.runnerId : "-"
    console.warn(
      `[nats-callout] ${ts} decision=${decision} class=${cls} runnerId=${rid}`,
      `nkey=${userNkey?.slice(0, 12) ?? "?"}… detail=${detail}`
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function connectionClassName(identity: ResolvedIdentity): string {
  return identity.class === "runner"
    ? `runner:${identity.runnerId}`
    : identity.class
}


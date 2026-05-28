/**
 * Resolve the NATS URLs handed to a *paired* runner.
 *
 * A paired runner may run on a different machine, so the URL host must be
 * routable *from that machine*. The embedded daemon's URL carries whatever host
 * the server bound to — which is the wildcard `0.0.0.0` (or `::`) when started
 * with `--remote` / `--host 0.0.0.0`. A wildcard host is never a valid client
 * destination: a remote runner would dial its own loopback and get
 * ECONNREFUSED.
 *
 * This mirrors the advertised-host rewrite that `/auth/token` already applies
 * (server.ts) via `NATS_ADVERTISED_HOST`. Kept self-contained (local
 * `rewriteUrlHost`) so the unit test does not pull in the native
 * `@lagz0ne/nats-embedded` dependency through `nats-bridge.ts`.
 */

/** Hosts that are bind-all wildcards and therefore unroutable as a client target. */
function isWildcardHost(host: string): boolean {
  return host === "" || host === "0.0.0.0" || host === "::" || host === "[::]"
}

/** Return `rawUrl` with its host replaced by `host`, trailing slash stripped. */
function rewriteUrlHost(rawUrl: string, host: string): string {
  const url = new URL(rawUrl)
  url.hostname = host
  return url.toString().replace(/\/$/, "")
}

export type RunnerPairingUrls =
  | { ok: true; natsUrl: string; natsWsUrl: string }
  | { ok: false; error: string }

/**
 * Compute the `natsUrl` / `natsWsUrl` to return from the pairing exchange.
 *
 * - If `NATS_ADVERTISED_HOST` is set, rewrite both URL hosts to it.
 * - Otherwise, if the daemon URL host is a wildcard, refuse (the operator must
 *   declare a routable host).
 * - Otherwise pass the daemon URLs through unchanged (e.g. `127.0.0.1` for
 *   same-machine pairing, or a concrete LAN/tailnet IP).
 */
export function resolveRunnerPairingUrls(
  daemonInfo: { url: string; wsUrl: string },
  env: NodeJS.ProcessEnv = process.env,
): RunnerPairingUrls {
  const advertisedHost = env.NATS_ADVERTISED_HOST?.trim()
  if (advertisedHost) {
    return {
      ok: true,
      natsUrl: rewriteUrlHost(daemonInfo.url, advertisedHost),
      natsWsUrl: rewriteUrlHost(daemonInfo.wsUrl, advertisedHost),
    }
  }

  const host = new URL(daemonInfo.url).hostname
  if (isWildcardHost(host)) {
    return {
      ok: false,
      error:
        `NATS is bound to a wildcard host (${host || "unspecified"}), which a remote ` +
        `runner cannot reach. Set NATS_ADVERTISED_HOST to the server's routable ` +
        `address (LAN or tailnet IP) and re-pair.`,
    }
  }

  return { ok: true, natsUrl: daemonInfo.url, natsWsUrl: daemonInfo.wsUrl }
}

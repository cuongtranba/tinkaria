/**
 * Runner pair flow (PR2 Stage 2).
 *
 * POSTs a pairing code to `POST /api/pairing/exchange` on the given server,
 * then persists the returned credential via writeRunnerCredential.
 *
 * Usage (CLI subcommand wired in runner.ts):
 *   bun run src/runner/runner.ts pair --server <url> --code <code>
 */

import { writeRunnerCredential } from "./runner-credential"

export interface PairRunnerOptions {
  serverUrl: string
  code: string
}

/**
 * Exchange a pairing code for a durable runner credential and write it to disk.
 * Throws if the server returns a non-OK status (expired, consumed, unknown, etc.).
 */
export async function pairRunner({ serverUrl, code }: PairRunnerOptions): Promise<void> {
  // The exchange RESPONSE carries the durable runner credential. Over plain HTTP
  // to a non-loopback host, a network-path attacker could capture it. Loopback /
  // WireGuard tailnet links are encrypted at the network layer; warn otherwise.
  // (Hard TLS requirement for non-loopback pairing is a pre-multi-tenant gate — decision 0008.)
  try {
    const u = new URL(serverUrl)
    const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1"
    if (u.protocol !== "https:" && !loopback) {
      console.warn(
        `[tinkaria] WARNING: pairing over non-loopback HTTP (${u.host}) — the runner credential is sent in the clear. Use HTTPS or pair over a WireGuard/tailnet link.`
      )
    }
  } catch {
    // malformed URL — let fetch surface the error below
  }

  const url = `${serverUrl.replace(/\/$/, "")}/api/pairing/exchange`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) {
    let errorDetail: string
    try {
      const body = await res.json() as { error?: string }
      errorDetail = body.error ?? res.statusText
    } catch {
      errorDetail = res.statusText
    }
    throw new Error(`Pairing exchange failed (${res.status}): ${errorDetail}`)
  }

  const { runnerId, token, natsUrl, natsWsUrl } = await res.json() as {
    runnerId: string
    token: string
    natsUrl: string
    natsWsUrl: string
  }

  // Derive the server's /nats-ws proxy URL from the server we paired against, so
  // the runner connects over the SAME tunneled HTTP port as the browser (e.g.
  // https://host -> wss://host/nats-ws) instead of the raw NATS TCP port, which
  // is often not tunneled and can drop server->runner pushes over the tailnet.
  let natsWsProxyUrl: string | undefined
  try {
    const u = new URL(serverUrl)
    const wsProtocol = u.protocol === "https:" ? "wss:" : "ws:"
    natsWsProxyUrl = `${wsProtocol}//${u.host}/nats-ws`
  } catch {
    // malformed server URL — leave undefined; runner falls back to natsUrl (TCP)
  }

  await writeRunnerCredential({ runnerId, token, natsUrl, natsWsUrl, natsWsProxyUrl, pairedAt: Date.now() })

  console.warn(`[tinkaria] Runner paired — runnerId: ${runnerId}`)
  console.warn(`[tinkaria] Credential written. Start the runner with: bun run src/runner/runner.ts`)
}

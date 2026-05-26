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

  await writeRunnerCredential({ runnerId, token, natsUrl, natsWsUrl, pairedAt: Date.now() })

  console.warn(`[tinkaria] Runner paired — runnerId: ${runnerId}`)
  console.warn(`[tinkaria] Credential written. Start the runner with: bun run src/runner/runner.ts`)
}

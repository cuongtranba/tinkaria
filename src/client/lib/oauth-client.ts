import type { AppTransport } from "../app/socket-interface"
import {
  oauthChangedSubject,
  oauthCommandSubject,
  type OAuthCommandType,
} from "../../shared/nats-subjects"
import type { ClaudeAuthSettings, OAuthTokenEntry } from "../../shared/types"

interface OkReply<T> {
  ok: true
  settings?: ClaudeAuthSettings
  entry?: OAuthTokenEntry
  removed?: boolean
  data?: T
}

interface ErrReply {
  ok: false
  error: string
}

type Reply<T> = OkReply<T> | ErrReply

async function call<T>(
  socket: AppTransport,
  cmd: OAuthCommandType,
  payload: unknown,
): Promise<OkReply<T>> {
  const reply = await socket.rawRequest<Reply<T>>(oauthCommandSubject(cmd), payload)
  if (!reply.ok) throw new Error(reply.error)
  return reply
}

export async function oauthList(socket: AppTransport): Promise<ClaudeAuthSettings> {
  const reply = await call<ClaudeAuthSettings>(socket, "oauth.list", {})
  if (!reply.settings) throw new Error("oauth.list missing settings")
  return reply.settings
}

export async function oauthAdd(
  socket: AppTransport,
  input: { label: string; token: string; maxConcurrent?: number },
): Promise<OAuthTokenEntry> {
  const reply = await call<OAuthTokenEntry>(socket, "oauth.add", input)
  if (!reply.entry) throw new Error("oauth.add missing entry")
  return reply.entry
}

export async function oauthRemove(socket: AppTransport, id: string): Promise<boolean> {
  const reply = await call<{ removed: boolean }>(socket, "oauth.remove", { id })
  return Boolean(reply.removed)
}

export async function oauthUpdate(
  socket: AppTransport,
  id: string,
  patch: { label?: string; maxConcurrent?: number | null },
): Promise<OAuthTokenEntry> {
  const reply = await call<OAuthTokenEntry>(socket, "oauth.update", { id, ...patch })
  if (!reply.entry) throw new Error("oauth.update missing entry")
  return reply.entry
}

export async function oauthSetConcurrencyDefault(socket: AppTransport, value: number): Promise<void> {
  await call<undefined>(socket, "oauth.setConcurrencyDefault", { value })
}

export function subscribeOAuthChanged(
  socket: AppTransport,
  handler: (settings: ClaudeAuthSettings) => void,
): () => void {
  return socket.rawSubscribe<{ settings: ClaudeAuthSettings }>(oauthChangedSubject(), (msg) => {
    if (msg?.settings) handler(msg.settings)
  })
}

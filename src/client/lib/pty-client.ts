import type { AppTransport } from "../app/socket-interface"
import { ptyCommandSubject } from "../../shared/nats-subjects"
import type { PtyInstanceState } from "../../shared/pty-instance"

interface BaseResponse {
  ok: boolean
  error?: string
}

interface SpawnArgs {
  chatId: string
  projectId: string
  cwd: string
  model: string
  planMode?: boolean
  oauthToken?: string | null
  oauthLabel?: string
}

interface SnapshotResponse extends BaseResponse {
  instances: PtyInstanceState[]
}

function ensureOk<T extends BaseResponse>(res: T): T {
  if (!res.ok) {
    throw new Error(res.error ?? "pty request failed")
  }
  return res
}

export async function ptySpawn(transport: AppTransport, args: SpawnArgs): Promise<BaseResponse> {
  const res = await transport.rawRequest<BaseResponse>(ptyCommandSubject("pty.spawn"), args)
  return ensureOk(res)
}

export async function ptyInput(transport: AppTransport, chatId: string, data: string): Promise<void> {
  const res = await transport.rawRequest<BaseResponse>(ptyCommandSubject("pty.input"), { chatId, data })
  ensureOk(res)
}

export async function ptyResize(transport: AppTransport, chatId: string, cols: number, rows: number): Promise<void> {
  const res = await transport.rawRequest<BaseResponse>(ptyCommandSubject("pty.resize"), { chatId, cols, rows })
  ensureOk(res)
}

export async function ptyCancel(transport: AppTransport, chatId: string): Promise<void> {
  const res = await transport.rawRequest<BaseResponse>(ptyCommandSubject("pty.cancel"), { chatId })
  ensureOk(res)
}

export async function ptyExit(transport: AppTransport, chatId: string): Promise<void> {
  const res = await transport.rawRequest<BaseResponse>(ptyCommandSubject("pty.exit"), { chatId })
  ensureOk(res)
}

export async function ptySnapshot(transport: AppTransport): Promise<PtyInstanceState[]> {
  const res = await transport.rawRequest<SnapshotResponse>(ptyCommandSubject("pty.snapshot"), {})
  ensureOk(res)
  return res.instances ?? []
}

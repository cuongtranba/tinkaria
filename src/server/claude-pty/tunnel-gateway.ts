export type ProposeFromToolResult =
  | { status: "ok"; url: string; tunnelId: string }
  | { status: "invalid_port"; reason: string }
  | { status: "no_tunnel"; reason: string }
  | { status: "error"; reason: string }

export interface TunnelGateway {
  getPublicUrl(): string | null
  isActive(): boolean
  getTokenForRequest?(): string | null
  proposeFromTool(args: { chatId: string; port: number }): Promise<ProposeFromToolResult>
}

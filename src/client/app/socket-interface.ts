import type { ClientCommand, SubscriptionTopic, TerminalEvent, TerminalSnapshot } from "../../shared/protocol"

export type SnapshotListener<T> = (value: T) => void
export type EventListener<T> = (value: T) => void
export type SocketStatus = "connecting" | "connected" | "disconnected"
export type StatusListener = (status: SocketStatus) => void

export interface AppTransport {
  start(): void
  dispose(): void
  onStatus(listener: StatusListener): () => void
  subscribe<TSnapshot, TEvent = never>(
    topic: SubscriptionTopic,
    listener: SnapshotListener<TSnapshot>,
    eventListener?: EventListener<TEvent>
  ): () => void
  subscribeTerminal(
    terminalId: string,
    handlers: {
      onSnapshot: SnapshotListener<TerminalSnapshot | null>
      onEvent?: EventListener<TerminalEvent>
    }
  ): () => void
  command<TResult = unknown>(command: ClientCommand, options?: { timeoutMs?: number }): Promise<TResult>
  /**
   * Low-level request/reply on a raw NATS subject. Used by additive
   * subsystems (claude-pty) that operate outside the ClientCommand union.
   * Payload is JSON-encoded; reply is gzip-decompressed then JSON-parsed.
   */
  rawRequest<TResult = unknown>(subject: string, payload: unknown, options?: { timeoutMs?: number }): Promise<TResult>
  ensureHealthyConnection(): Promise<void>
}

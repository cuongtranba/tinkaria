// In-memory EventStore stub for unit tests.
// Implements only the subset of EventStore methods required by tool-callback
// and related MCP tool tests.

import type { ToolRequest, ToolRequestStatus, ToolRequestDecision } from "../../shared/permission-policy"
import { POLICY_TERMINAL_STATUSES } from "../../shared/permission-policy"
import type { EventStore } from "../event-store"

export function createTestStorage(): { dir: string; cleanup: () => Promise<void> } {
  throw new Error("test-helpers stub — implement when activating PTY mcp-tool tests")
}

interface InMemoryEventStore {
  initialize(): Promise<void>
  putToolRequest(req: ToolRequest): Promise<void>
  getToolRequest(id: string): ToolRequest | null
  listPendingToolRequests(chatId: string): ToolRequest[]
  resolveToolRequest(
    id: string,
    update: { status: ToolRequestStatus; decision: ToolRequestDecision; resolvedAt: number; mismatchReason?: string },
  ): Promise<void>
  scanAllToolRequests(): ToolRequest[]
}

export function createTestEventStore(_dataDir?: string): EventStore {
  const requests = new Map<string, ToolRequest>()

  const store: InMemoryEventStore = {
    async initialize() {
      // No-op for in-memory store
    },

    async putToolRequest(req: ToolRequest): Promise<void> {
      requests.set(req.id, { ...req })
    },

    getToolRequest(id: string): ToolRequest | null {
      return requests.get(id) ?? null
    },

    listPendingToolRequests(chatId: string): ToolRequest[] {
      const result: ToolRequest[] = []
      for (const req of requests.values()) {
        if (req.chatId === chatId && !POLICY_TERMINAL_STATUSES.has(req.status)) {
          result.push({ ...req })
        }
      }
      return result
    },

    async resolveToolRequest(
      id: string,
      update: { status: ToolRequestStatus; decision: ToolRequestDecision; resolvedAt: number; mismatchReason?: string },
    ): Promise<void> {
      const existing = requests.get(id)
      if (existing) {
        requests.set(id, { ...existing, ...update })
      }
    },

    scanAllToolRequests(): ToolRequest[] {
      return Array.from(requests.values()).map((r) => ({ ...r }))
    },
  }

  return store as unknown as EventStore
}

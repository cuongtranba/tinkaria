// Stub helper module to satisfy ported test imports.
// Replace with full port if PTY mcp-tool tests are reactivated.

export function createTestStorage(): { dir: string; cleanup: () => Promise<void> } {
  throw new Error("test-helpers stub — implement when activating PTY mcp-tool tests")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTestEventStore(_args?: any): any {
  return {
    initialize: async () => {},
    listPendingToolRequests: async () => [],
    putToolRequest: async () => {},
    resolveToolRequest: async () => {},
    getToolRequest: async () => null,
    scanAllToolRequests: async () => [],
    appendSubagentEvent: async () => {},
    runningSubagentRuns: async () => [],
    cleanup: async () => {},
  }
}

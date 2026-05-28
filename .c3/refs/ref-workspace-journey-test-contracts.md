---
id: ref-workspace-journey-test-contracts
c3-seal: 1ab206d0eebd61eb549302eebfad75ad3b5efcf79c12b54ab220d73905e7b857
title: workspace-journey-test-contracts
type: ref
goal: Define the contract between journey recipes and their corresponding test files, ensuring every journey stage has a testable assertion.
---

## Goal

Define the contract between journey recipes and their corresponding test files, ensuring every journey stage has a testable assertion.

## Choice

Two-layer test coverage per journey stage: integration tests (Bun test, snapshot state machine) and E2E tests (agent-browser, screen flow). Each stage maps to both layers.

## Why

Journey recipes are the single source of truth for user flows. Without enforced test contracts, recipes become stale documentation. The two-layer approach catches both data-layer regressions (integration) and rendering regressions (E2E) independently, keeping CI fast while maintaining full coverage.

## How

Each journey recipe defines stages. Each stage maps to:

1. **Integration test** (Bun test) — tests the subscription snapshot state machine. Command → snapshot change → assertion. These run without a browser.
2. **E2E test** (agent-browser) — tests the screen flow end-to-end against a live runtime. Navigation → interaction → visual assertion.

### Integration Test Mapping

| Journey | Test File | What It Tests |
| --- | --- | --- |
| Task Coordination | src/server/workspace-coordination.test.ts | Todo CRUD via commands, rule CRUD, filter state derivation |
| File Ownership | src/server/workspace-file-ownership.test.ts | Claim lifecycle, worktree lifecycle, repo CRUD via commands |
| Isolated Dev | src/server/sandbox-manager.test.ts (existing) + sandbox-journey.test.ts | Sandbox state machine: create→running→stop→start→destroy |
| Automation | src/server/workflow-engine.test.ts (existing) + agent-config.test.ts | Workflow run observation, agent config CRUD |

### E2E Test Mapping

| Journey | Script | Stages Covered |
| --- | --- | --- |
| Task Coordination | scripts/verify-workspace-task-journey.ts | Navigate → add todo → claim → complete → filter → add rule → edit → remove |
| File Ownership | scripts/verify-workspace-ownership-journey.ts | Navigate → create claim → release → create worktree → assign → remove → add repo → remove |
| Isolated Dev | scripts/verify-workspace-sandbox-journey.ts | Navigate → create sandbox → observe status → stop → start → destroy |
| Automation | scripts/verify-workspace-automation-journey.ts | Navigate → observe runs → cancel → add agent → edit → remove |

### Stage Assertion Pattern

Every stage assertion follows:

```typescript
// Integration test
test("stage N: <description>", () => {
  // Arrange: emit command
  // Act: derive snapshot
  // Assert: snapshot matches expected state
});

// E2E test
async function verifyStageN(browser: AgentBrowser) {
  // Navigate or interact
  // Wait for subscription update (element appears/changes)
  // Screenshot + assert DOM state
}
```

### Coverage Rule

A journey recipe stage is "covered" when:

- It has a corresponding integration test that asserts the snapshot state change
- It has a corresponding E2E stage function that asserts the screen state
- Both tests pass in CI

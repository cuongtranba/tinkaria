---
id: rule-journey-test-coverage
c3-seal: 6fa161aa1a5ac4d7d5d8b0d194334c633f38b59d5b5d4a71620525bb9b540436
title: journey-test-coverage
type: rule
goal: Ensure every journey recipe stage has both an integration test (snapshot assertion) and an E2E test (screen assertion), preventing journeys from becoming stale documentation.
---

## Goal

Ensure every journey recipe stage has both an integration test (snapshot assertion) and an E2E test (screen assertion), preventing journeys from becoming stale documentation.

## Rule

Every journey recipe stage MUST have a corresponding integration test asserting the snapshot state change AND a corresponding E2E stage function asserting the screen state. New or modified journey stages require both test layers before the feature is considered complete.

## Golden Example

```typescript
// recipe-workspace-task-coordination-journey, Stage 2: Add todo
// Integration test (src/server/workspace-coordination.test.ts)
test("stage 2: add todo appears in snapshot", () => {
  const store = createTestEventStore();
  store.command("workspace.todo.add", {
    todoId: "t1", description: "Fix bug", priority: "high"
  });
  const snap = deriveWorkspaceSnapshot(store.state, workspaceId);
  expect(snap.todos).toContainEqual(
    expect.objectContaining({ id: "t1", status: "open", description: "Fix bug" })
  );
});

// E2E test (scripts/verify-workspace-task-journey.ts)
async function verifyStage2_AddTodo(ab: AgentBrowser) {
  await ab.click('[data-ui-id="workspace.todos"] [data-ui-id="panel.add-button"]');
  await ab.fill('[data-ui-id="workspace.todos.add-form"] input', "Fix bug");
  await ab.click('[data-ui-id="workspace.todos.add-form"] button[type="submit"]');
  await ab.wait('[data-ui-id="workspace.todos.item"]');
  await ab.screenshot();
}
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| Testing EventStore internals (event appended) instead of snapshot outcome | Assert on derived snapshot state | Tests the mechanism, not the user-visible journey stage outcome |
| E2E test clicking without data-ui-id selectors | Use data-ui-id attribute selectors | Brittle selectors break on UI refactor without catching regressions |
| E2E test without waiting for subscription update | Always wait for element after action | Race condition — screenshot taken before state change propagates |
| Journey stage added without updating test files | Update both test layers in same PR | Journey becomes unverified documentation |

## Scope

Applies to all journey recipe stages in workspace coordination, file ownership, isolated dev, and automation journeys. Integration tests run on every push. E2E tests run on merge to main.

---
id: recipe-workspace-task-coordination-journey
c3-seal: d007404a13bf9ae8d42c8dfc8ae628d11f6d14765e87fe29c3e936da8da78689
title: workspace-task-coordination-journey
type: recipe
goal: 'Trace the end-to-end task coordination journey: user navigates to workspace, manages shared todos (add → claim → complete/abandon), filters by state, and manages project rules (add → edit → remove).'
---

## Goal

Trace the end-to-end task coordination journey: user navigates to workspace, manages shared todos (add → claim → complete/abandon), filters by state, and manages project rules (add → edit → remove).

### JTBD

When I'm coordinating work across multiple sessions on the same project, I want to see and manage shared tasks so that sessions don't duplicate effort or miss work items.

### Screen Flow

| Stage | Route | Panel | User Action | Expected State Change |
| --- | --- | --- | --- | --- |
| 1. Navigate | / → /workspace/:id | — | Click workspace card | Page loads, spinner → 8 panels |
| 2. Add todo | /workspace/:id | TodosPanel | Fill description + priority, click Add | Todo appears in list with "open" status |
| 3. Claim todo | /workspace/:id | TodosPanel | Click "Claim" on open todo | Todo shows claimed state, session "ui" |
| 4a. Complete todo | /workspace/:id | TodosPanel | Click "Done" on claimed todo | Todo moves to complete filter |
| 4b. Abandon todo | /workspace/:id | TodosPanel | Click "Abandon" → confirm dialog | Todo returns to open state |
| 5. Filter todos | /workspace/:id | TodosPanel | Click filter pills (All/Open/Claimed/Done) | List filters to matching state |
| 6. Add rule | /workspace/:id | RulesPanel | Fill textarea, click "Add Rule" | Rule appears in list |
| 7. Edit rule | /workspace/:id | RulesPanel | Click edit icon → modify → save | Rule content updates inline |
| 8. Remove rule | /workspace/:id | RulesPanel | Click trash → confirm dialog | Rule removed from list |

### Subscription Dependencies

- `useWorkspaceSubscription(socket, workspaceId)` → todos, rules in snapshot
- Commands: workspace.todo.add, workspace.todo.claim, workspace.todo.complete, workspace.todo.abandon, workspace.rule.set, workspace.rule.remove

### Test Contract

Each stage maps to a testable assertion:

- Stage 1: `/workspace/:id` renders, spinner resolves, all 8 panels present
- Stage 2-4: Todo CRUD operations reflect in subscription snapshot
- Stage 5: Filter state changes rendered list
- Stage 6-8: Rule CRUD operations reflect in subscription snapshot

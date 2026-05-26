---
id: recipe-workspace-automation-journey
c3-seal: dacda80d5cc812eeb21f00d28bf33dd2b71411d046a641d79e9d2459b7fe40d4
title: workspace-automation-journey
type: recipe
goal: 'Trace the automation and monitoring journey: user observes workflow runs, cancels active runs, manages agent configurations, and enables push notifications.'
---

## Goal

Trace the automation and monitoring journey: user observes workflow runs, cancels active runs, manages agent configurations, and enables push notifications.

### JTBD

When automated workflows run across my workspace, I want to monitor their progress and manage agent configurations so that I can intervene when things go wrong and tune agent behavior.

### Screen Flow

| Stage | Route | Panel | User Action | Expected State Change |
| --- | --- | --- | --- | --- |
| 1. View workflows | /workspace/:id | WorkflowPanel | Observe run list | Runs with status badges, step progress |
| 2. Cancel active run | /workspace/:id | WorkflowPanel | Click X-circle on active run | Run status → "cancelled" |
| 3. Add agent config | /workspace/:id | AgentConfigPanel | Fill name/desc/provider/model/prompt/tools/temp, click Create | Agent appears in list |
| 4. Edit agent config | /workspace/:id | AgentConfigPanel | Click edit → modify fields → Save | Agent config updates |
| 5. Remove agent config | /workspace/:id | AgentConfigPanel | Click trash → confirm | Agent removed |
| 6. Enable notifications | / | HomepagePreferences | Click notification toggle | Browser permission prompt → subscribed |

### Subscription Dependencies

- `useWorkflowRunsSubscription` → runs, activeRunIds
- `useAgentConfigSubscription` → agent configs
- Commands: workspace.workflow.cancel, workspace.agent.save/remove
- Push: GET /api/push/vapid-key, POST /api/push/subscribe, DELETE /api/push/subscribe

### Known UX Gaps (from audit)

- No way to trigger workflows from UI (MCP-only)
- Step output/error not shown in panel
- No run duration display
- No workflow definition browsing
- Notification toggle is global (homepage), not per-workspace

### Test Contract

- Stage 1: Workflow runs render with correct status badges
- Stage 2: Cancel removes from activeRunIds
- Stages 3-5: Agent config CRUD in subscription snapshot
- Stage 6: Push subscription registered with server

---
id: recipe-workspace-file-ownership-journey
c3-seal: 4aa428ddfa073a6e7e4b274c3f76a741de7458ade7c75d38cb381c98fc750cdd
title: workspace-file-ownership-journey
type: recipe
goal: 'Trace the file ownership journey: user manages claims (intent + files), worktrees (branch isolation + session assignment), and repos (add/clone, pull, push, remove).'
---

## Goal

Trace the file ownership journey: user manages claims (intent + files), worktrees (branch isolation + session assignment), and repos (add/clone, pull, push, remove).

### JTBD

When multiple sessions edit files in the same project, I want to declare intent over files and use isolated branches so that sessions don't create merge conflicts.

### Screen Flow

| Stage | Route | Panel | User Action | Expected State Change |
| --- | --- | --- | --- | --- |
| 1. Create claim | /workspace/:id | ClaimsPanel | Fill intent + files + session, click "Claim" | Claim appears as active |
| 2. View claims | /workspace/:id | ClaimsPanel | Observe active claims list | Shows intent, files, session |
| 3. Release claim | /workspace/:id | ClaimsPanel | Click shield-off icon | Claim moves to "Released" collapsible |
| 4. Create worktree | /workspace/:id | WorktreesPanel | Fill branch + base, click Create | Worktree appears with "ready" status |
| 5. Assign session | /workspace/:id | WorktreesPanel | Click user-plus → select session → Assign | Worktree shows assigned session |
| 6. Remove worktree | /workspace/:id | WorktreesPanel | Click trash → confirm | Worktree moves to "Removed" collapsible |
| 7. Add local repo | /workspace/:id | RepoPanel | Fill path + label, click Add | Repo appears in list |
| 8. Clone repo | /workspace/:id | RepoPanel | Switch to Clone, fill URL + path, click Clone | Repo appears in list |
| 9. Pull/Push repo | /workspace/:id | RepoPanel | Click pull/push icons | Toast confirms operation |
| 10. Remove repo | /workspace/:id | RepoPanel | Click trash → confirm | Repo removed (files stay on disk) |

### Subscription Dependencies

- `useWorkspaceSubscription` → claims, worktrees in snapshot
- `useRepoSubscription` → repos
- Commands: workspace.claim.create/release, workspace.worktree.create/assign/remove, workspace.repo.add/clone/pull/push/remove

### Test Contract

- Stages 1-3: Claim lifecycle in subscription snapshot
- Stages 4-6: Worktree lifecycle
- Stages 7-10: Repo CRUD + git operations

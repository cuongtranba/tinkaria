---
id: recipe-client-screen-tree
c3-seal: cef3bfa422b3729c2af7c463481e2f72086b6c1f2b6a622709328e364821bb5e
title: client-screen-tree
type: recipe
goal: Maintain a fast lookup artifact for the client screen tree so any visible browser surface can be traced quickly from route -> owning C3 component -> semantic Alt+Shift ui id.
---

## Goal

Maintain a fast lookup artifact for the client screen tree so any visible browser surface can be traced quickly from route -> owning C3 component -> semantic Alt+Shift ui id.

### Route-Owned Screen Map

| Surface | Owner | Route / Trigger | Main Regions | Key UI IDs |
| --- | --- | --- | --- | --- |
| Browser app shell | c3-101 | all routes | routed outlet, persistent sidebar, global Alt+Shift overlay | chat.sidebar, chat.right-sidebar |
| Local projects screen | c3-117 | / | header, connection/setup states, recent sessions, stats, workspace grid, add-project modal | home.page, home.header, home.status, home.setup, home.recent-sessions, home.project-stats, home.workspace-grid, home.add-project.action, home.add-project.dialog, home.project-card, home.recent-session-card |
| Chat screen | c3-110 | /chat/:chatId | navbar, transcript, composer, right sidebar, fork-session dialog | chat.page, chat.navbar, transcript.message-list, chat.composer, chat.right-sidebar, chat.fork-session.dialog |
| Global sidebar shell | c3-113 | mounted on all routes | project groups, chat rows, per-group session picker | chat.sidebar, sidebar.project-group, sidebar.chat-row, sidebar.project-group.sessions.action, sidebar.project-group.sessions.popover, sidebar.project-group.sessions.search.input, sidebar.project-group.sessions.list |
| UI identity overlay | c3-108 | hold Alt+Shift over any tagged surface | nearest-tag stack, copy action, highlight rect | ids are emitted by tagged surfaces and revealed by the overlay |
| Workspace coordination page | c3-209 | /workspace/:id | header, 8-panel 2×4 grid (TodosPanel, ClaimsPanel, WorktreesPanel, RulesPanel, RepoPanel, AgentConfigPanel, WorkflowPanel, SandboxPanel) | workspace.page, workspace.todos, workspace.claims, workspace.worktrees, workspace.rules, workspace.repos, workspace.agents, workspace.workflows, workspace.sandbox |

### Component Tree By Screen

| Screen | Ordered Subtree |
| --- | --- |
| / | c3-101 app-shell -> c3-113 sidebar + c3-117 projects -> PageHeader + LocalDev -> RecentSessionCard[] + StatCard[] + ProjectCard[] + NewProjectModal |
| /chat/:chatId | c3-101 app-shell -> c3-113 sidebar + c3-110 chat -> ChatNavbar + ForkSessionDialog + TinkariaTranscript + ChatInput + optional RightSidebar |
| Sidebar overlays | c3-113 sidebar -> LocalProjectsSection -> ChatRow[] + ProjectSectionMenu + SessionPicker |
| Alt+Shift inspection path | c3-108 ui-identity -> App overlay controller -> UiIdentityOverlay -> DOM data-ui-id stack emitted by route components |
| /workspace/:id | c3-101 app-shell -> c3-113 sidebar + c3-209 coordination -> TodosPanel + ClaimsPanel + WorktreesPanel + RulesPanel + RepoPanel + AgentConfigPanel + WorkflowPanel(c3-225 workflow) + SandboxPanel(c3-225 sandbox) |

### ALT+SHIFT Linkage Rules

| What the overlay shows | Owning C3 component |
| --- | --- |
| home.* ids | c3-117 |
| chat.page, chat.fork-session.*, transcript.message-list | c3-110 |
| chat.composer.* | c3-112 |
| chat.sidebar, sidebar.* | c3-113 |
| message.*, content-preview.dialog | c3-111 / c3-107 depending on transcript vs rich-content surface |
| overlay/controller internals | c3-108 |
| workspace.* ids | c3-209 |
| Use this recipe as the first stop when a task starts from a screen, a screenshot, or an Alt+Shift copy buffer. It is the crosswalk between DOM identity, route ownership, and the C3 topology. |  |

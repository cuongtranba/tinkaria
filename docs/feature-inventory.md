# Tinkaria — Feature Inventory & Ratings

_Generated 2026-05-03 from GitNexus index (460 files, 3,621 symbols, 287 processes, 26 clusters)._

Ratings = ⭐1–5 based on **scope + cohesion + observable maturity** (symbol count, presence of tests, cluster cohesion %).

---

## Core Runtime

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 1 | **Bun HTTP + WS server** | `src/server/server.ts`, `nats-bridge.ts` | ⭐⭐⭐⭐⭐ | Largest cluster (637 sym, 79% cohesion). Has tests. Central nervous system. |
| 2 | **NATS messaging backbone** (daemon mgr, bridge, publisher, subjects, snapshot KV) | `nats-daemon-manager.ts`, `nats-bridge.ts`, `nats-publisher.ts`, `shared/nats-subjects.ts` | ⭐⭐⭐⭐⭐ | Core transport for everything. Perf benchmarks present (`scripts/perf-nats-baseline.ts`). |
| 3 | **Event store** (`EventStore`, ~1.6k LOC) | `src/server/event-store.ts` | ⭐⭐⭐⭐⭐ | Single very large class — durable history of chat/turn events. |
| 4 | **Runner agent** (turn lifecycle, cancel, interrupt, title gen) | `src/runner/runner-agent.ts`, `runner-nats.ts` | ⭐⭐⭐⭐⭐ | Tight cluster (92% cohesion, 41 sym). Tested. |
| 5 | **Runner proxy + runtime registry** | `runner-proxy.ts`, `runtime-registry.ts` | ⭐⭐⭐⭐ | Multi-runtime detection + proxying. |

## Provider / CLI Integration

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 6 | **Claude provider** (reasoning effort, model normalization) | `provider-catalog.ts`, `shared/types.ts` | ⭐⭐⭐⭐ | Rich preference model. |
| 7 | **Codex App Server manager** (`CodexAppServerManager`, ~950 LOC) | `src/server/codex-app-server.ts` | ⭐⭐⭐⭐ | Big single class — opportunity to split. |
| 8 | **Quick response (structured codex output)** | `quick-response.ts` | ⭐⭐⭐ | Niche utility. |
| 9 | **Provider health dot / Providers tab** | `client/app/ProvidersTab.tsx` | ⭐⭐⭐ | Minor surface. |

## Sessions & Orchestration

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 10 | **Session orchestrator** (`SessionOrchestrator`, ~500 LOC) | `orchestration.ts` | ⭐⭐⭐⭐⭐ | Central coordinator. |
| 11 | **Delegation coordinator** (subagent dispatch) | `delegation-coordinator.ts` | ⭐⭐⭐⭐ | ~370 LOC class. |
| 12 | **Session discovery** (parses Claude + Codex transcripts) | `session-discovery.ts` | ⭐⭐⭐⭐ | Resume-from-disk capability. |
| 13 | **Session index** | `session-index.ts` | ⭐⭐⭐ | Catalog layer. |
| 14 | **Read-models / snapshots** (`deriveChatSnapshot`, transcript render units) | `read-models.ts` | ⭐⭐⭐⭐ | Backbone of UI state derivation. |
| 15 | **Generate merge / fork prompt for chats** | `generate-merge-context.ts` | ⭐⭐⭐ | Clear feature, modest scope. |

## Chat UI (Client)

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 16 | **App state machine + chat commands** | `useAppState.ts`, `useAppState.machine.ts`, `useChatCommands.ts` | ⭐⭐⭐⭐⭐ | App cluster is 288 sym, well-organized. |
| 17 | **Chat input** (queueing, draft, restore, skill insert) | `components/chat-ui/ChatInput.tsx` | ⭐⭐⭐⭐ | Behavior helpers extracted (`shouldQueueOnSubmitKeystroke`, etc.). |
| 18 | **Chat Navbar / repo label / Navigator** | `ChatNavbar.tsx` | ⭐⭐⭐⭐ | Recently changed (last 3 commits). |
| 19 | **Terminal pane + workspace** (resize, layout, animation) | `TerminalPane.tsx`, `TerminalWorkspace.tsx`, `useTerminalToggleAnimation.ts` | ⭐⭐⭐⭐ | Layered: layout helpers, animation curves, store. |
| 20 | **Right sidebar** (toggle animation, layout store) | `useRightSidebarToggleAnimation.ts`, `rightSidebarStore.ts` | ⭐⭐⭐⭐ | Persistent project layout. |
| 21 | **Scroll follow / sticky focus / scroll sync** | `useScrollFollow.ts`, `scrollFollowStore.ts`, `useStickyChatFocus.ts` | ⭐⭐⭐⭐ | Carefully built scroll machine. |
| 22 | **Sandbox subscription** | `useSandboxSubscription.ts`, `sandbox-health.ts`, `sandbox-journey.test.ts` | ⭐⭐⭐⭐ | Docker-backed sandbox monitoring. |
| 23 | **Chat focus policy** (text-entry detection) | `chatFocusPolicy.ts` | ⭐⭐⭐ | Tested helper. |
| 24 | **Chat cache (hydration)** | `chatCache.ts` | ⭐⭐⭐ | Cache primitives. |
| 25 | **Mobile sidebar swipe gesture** | `ChatPage.tsx` (`MobileSidebarSwipeDecisionArgs`) | ⭐⭐⭐ | Recently touched in working tree. |

## Messages / Rendering

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 26 | **Message renderer + collapsed tool groups** | `components/messages/*` | ⭐⭐⭐⭐ | Cluster Messages 46 sym, 89% cohesion. |
| 27 | **Ask-user-question interactive message** | `AskUserQuestionMessage.tsx` | ⭐⭐⭐⭐ | Selectable + custom input. |
| 28 | **Local file preview dialog** (markdown, ASCII tree) | `LocalFilePreviewDialog.tsx` | ⭐⭐⭐ | Substantial helpers. |
| 29 | **Present-content message** | `PresentContentMessage.tsx` | ⭐⭐⭐ | Error/result rendering. |
| 30 | **Subagent indicator (tree)** | `SubagentIndicator.tsx` | ⭐⭐⭐⭐ | Inspector for nested subagent runs. |
| 31 | **Rich-content / Embed renderer** (HTML / SVG / Pug, zoomable viewport) | `rich-content/EmbedRenderer.tsx`, `ContentViewerContext.ts` | ⭐⭐⭐⭐ | 92% cohesion, custom embed isolation. |
| 32 | **Puggy template engine** (parser, expressions, HTML renderer, capability sandbox) | `shared/puggy/*` | ⭐⭐⭐⭐ | 3 clusters (Renderer 94%, Parser 90%, Expressions 92%) — very tight. Custom DSL. |

## Coordination / Multi-Agent

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 33 | **Coordination panels** (Todos, Worktrees, Claims, Rules, Workflow, AgentConfig) | `components/coordination/*` | ⭐⭐⭐⭐ | 87% cohesion, 19 sym, full UI surface. |
| 34 | **NATS coordination client** (claim, release, assign worktree, todos) | `runner/nats-coordination-client.ts` | ⭐⭐⭐⭐ | Backs the panels above. |
| 35 | **Coordination MCP server** | `coordination-mcp.ts` | ⭐⭐⭐ | MCP entrypoint for external agents. |
| 36 | **Repo manager (git)** | `repo-manager.ts` | ⭐⭐⭐ | Tested, modest scope. |

## Workspaces / Projects

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 37 | **Workspace agent routes** | `workspace-agent-routes.ts` (+test) | ⭐⭐⭐⭐ | HTTP API surface, tested. |
| 38 | **Workspace config manager** | `workspace-config-manager.ts` (+test) | ⭐⭐⭐ | Per-project settings persistence. |
| 39 | **NewWorkspaceModal** | `components/NewWorkspaceModal.tsx` | ⭐⭐⭐ | UI affordance. |
| 40 | **LocalDev panel** | `components/LocalDev.tsx` | ⭐⭐⭐ | Local projects browser. |

## Stores / Preferences

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 41 | **Chat preferences store** (provider defaults, composer state, model normalization) | `chatPreferencesStore.ts` | ⭐⭐⭐⭐ | 96% cohesion cluster. |
| 42 | **Terminal layout / preferences** (per-project layout, scrollback) | `terminalLayoutStore.ts`, `terminalPreferencesStore.ts` | ⭐⭐⭐⭐ | Project-scoped layouts. |
| 43 | **Skill composition store** (slash-command insertion, prefix parsing) | `skillCompositionStore.ts` | ⭐⭐⭐⭐ | Powers `/skill` typing. |
| 44 | **Right sidebar store** (size clamp, defaults) | `rightSidebarStore.ts` | ⭐⭐⭐ | Layout state. |

## Hooks / Platform

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 45 | **Keyboard shortcuts** (`useShortcuts`, ShortcutHelpOverlay) | `hooks/useShortcuts.ts`, `ShortcutHelpOverlay.tsx` | ⭐⭐⭐⭐ | Scoped + grouped + help UI. |
| 46 | **Theme provider** (light/dark) | `hooks/useTheme.tsx` | ⭐⭐⭐ | Standard. |
| 47 | **PWA resume** (visibility / focus / online / pageshow handlers re-bind subs) | `usePwaResume.ts` | ⭐⭐⭐⭐ | Multiple processes converge on subscription reset. |
| 48 | **Standalone / mobile detection** | `useIsStandalone.ts`, `useIsMobile.ts` | ⭐⭐⭐ | Tiny but used. |
| 49 | **Push notifications** (web push, VAPID, store, toggle) | `server/push-notifications.ts`, `hooks/usePushNotifications.ts`, `NotificationToggle.tsx` | ⭐⭐⭐⭐ | Full stack. |
| 50 | **Update manager** | `update-manager.ts` | ⭐⭐⭐ | Auto-update flow. |

## Extensions / Plugins

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 51 | **Extension router + manifest** | `extension-router.ts`, `shared/extension-types.ts` | ⭐⭐⭐⭐ | Generic plugin system. |
| 52 | **Agents extension** (sections, skills) | `client/extensions/agents/client.tsx` | ⭐⭐⭐ | Built on extension system. |
| 53 | **C3 extension** (entity badges, list endpoints) | `client/extensions/c3/client.tsx`, `server/extensions/c3/server.ts` | ⭐⭐⭐⭐ | C3 architecture integration — well-defined types. |
| 54 | **Code extension** (deps table) | `client/extensions/code/client.tsx` | ⭐⭐⭐ | Smaller surface. |

## Auxiliary / Tooling

| # | Feature | Where | Rating | Notes |
|---|---------|-------|--------|-------|
| 55 | **Share** (read-only chat sharing) | `server/share.ts` | ⭐⭐⭐ | `logShareDetails`. |
| 56 | **Skill discovery + cache** | `server/skill-discovery.ts` | ⭐⭐⭐ | Backs slash commands. |
| 57 | **CLI runtime** (arg parsing, help) | `cli-runtime.ts` | ⭐⭐⭐ | Server entry. |
| 58 | **Web context prompt builder** | `shared/web-context.ts` | ⭐⭐⭐ | Subagent context. |
| 59 | **UI identity overlay** (debug/inspector) | `lib/uiIdentityOverlay.ts` + various components | ⭐⭐⭐ | Internal QA tool. |
| 60 | **Perf benchmark scripts** | `scripts/perf-nats-baseline.ts`, `bench-compression.ts` | ⭐⭐⭐ | Benchmarking infra. |

---

## Summary by Health

- **⭐⭐⭐⭐⭐ Pillars (5)**: NATS bus, Event store, Runner agent, App state, Server core — load-bearing and well-cohesion'd.
- **⭐⭐⭐⭐ Strong features (~25)**: Most chat-UI, coordination, message rendering, Puggy renderer, push, extensions.
- **⭐⭐⭐ Solid but smaller (~25)**: Auxiliary panels, helper stores, individual extensions.

## Refactor Candidates Flagged by Graph

- **`CodexAppServerManager`** (~951 LOC single class) — outlier in size; opportunity to split.
- **`EventStore`** (~1.6k LOC) — large but central; likely intentional, but worth revisiting cohesion.
- **`Server` cluster cohesion 79%** — lowest of large clusters; some symbols may belong elsewhere (e.g., `clampScrollback` lives in a Stores file but graph attributes it to Server).
- **`Chat-ui` cluster cohesion 76%** — lowest overall; mixing TerminalPane, ChatInput, ChatNavbar, SubagentIndicator may benefit from sub-clustering.

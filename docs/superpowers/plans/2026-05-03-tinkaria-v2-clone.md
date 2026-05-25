# Tinkaria v2 — Full Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a master plan organized in 13 phases — each phase produces working, testable software and may be split into a sub-plan if executed by separate teams.

**Goal:** Build a feature-equivalent clone of Tinkaria — a local web workbench for Claude Code and Codex CLIs — on a stack tuned for performance, quality, and low long-term maintenance cost.

**Architecture:** Bun runtime + Hono server + tRPC v11 type-safe API + Drizzle ORM on `bun:sqlite` for persistence + NATS Core (transport-only, no JetStream) for multi-runner pub/sub. Frontend: React 19 SPA bundled by Vite 7, routed by TanStack Router, server state via TanStack Query, UI state via Zustand, machines via XState 5. shadcn/ui (Radix Primitives + Tailwind 4) for components, MDX for AI-generated rich content, Shiki for syntax highlight, Motion for animations, xterm.js 5 LTS for terminals.

**Tech Stack:**
- **Runtime/Build:** Bun 1.x · Vite 7 · TypeScript 5.9 · Biome v2 · Vitest 3 · Playwright
- **Server:** Hono 4 · tRPC v11 · Drizzle ORM · `bun:sqlite` · NATS Core · execa · node-pty · Pino · Zod 4 · web-push
- **Client:** React 19 · TanStack Router/Query/Table/Virtual · Zustand 5 · XState 5 · shadcn/ui (Radix + Tailwind 4) · React Hook Form · MDX 3 · Shiki · Mermaid · Motion · xterm.js 5 · Sonner · cmdk · lucide-react · streamdown · react-markdown
- **Infra:** vite-plugin-pwa · cloudflared · OpenTelemetry SDK

**Repo Layout (target):**
```
tinkaria-v2/
├── apps/
│   ├── web/              # React 19 SPA (Vite)
│   └── server/           # Bun + Hono + tRPC
├── packages/
│   ├── api/              # tRPC routers + Zod schemas (shared types)
│   ├── db/               # Drizzle schema + migrations + queries
│   ├── domain/           # Pure business logic (no IO) — chat, runner, coordination
│   ├── transport/        # NATS Core wrappers + SSE/WS helpers
│   ├── providers/        # Claude SDK + Codex spawn adapters
│   └── ui/               # Shared shadcn-style component library
├── e2e/                  # Playwright suite
├── scripts/              # Dev/build helpers
├── biome.json
├── tsconfig.base.json
└── package.json          # Bun workspaces root
```

---

## Phase 0 — Project Bootstrap

**Goal:** A green-field repo with workspaces, lint/format, type-check, test runner, and CI all wired and passing on an empty hello-world.

**Files:**
- Create: `package.json` (workspaces), `tsconfig.base.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.gitignore`, `README.md`
- Create per-package `package.json` and `tsconfig.json` for every workspace
- Create: `apps/web/src/main.tsx`, `apps/server/src/index.ts` (smoke files)

### Task 0.1: Initialize repo and workspaces

- [ ] **Step 1:** `mkdir tinkaria-v2 && cd tinkaria-v2 && git init && bun init -y`
- [ ] **Step 2:** Replace generated `package.json` with workspace root:

```json
{
  "name": "tinkaria-v2",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.11",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun test && bun run --filter '*' test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "bun run --filter '*' typecheck",
    "dev": "bun run scripts/dev.ts"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "typescript": "5.9.0",
    "@types/bun": "^1.3.11"
  }
}
```

- [ ] **Step 3:** `bun install`
- [ ] **Step 4:** Create `tsconfig.base.json` with `strict`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `isolatedModules`, `noUnusedLocals`, `verbatimModuleSyntax`.
- [ ] **Step 5:** Commit `chore: bootstrap workspace root`.

### Task 0.2: Add Biome + EditorConfig + Husky-equivalent pre-commit

- [ ] **Step 1:** Run `bunx @biomejs/biome init`. Edit `biome.json` to enable formatter, linter, and `useImportType` rule.
- [ ] **Step 2:** Add `.editorconfig` with 2-space LF UTF-8.
- [ ] **Step 3:** Add `.git/hooks/pre-commit` (committed copy in `scripts/hooks/pre-commit`) running `bun run lint` and `bun run typecheck` on staged files.
- [ ] **Step 4:** Run `bun run lint` — expect "no files matched" or pass.
- [ ] **Step 5:** Commit `chore: add biome and pre-commit hook`.

### Task 0.3: Set up CI

- [ ] **Step 1:** Create `.github/workflows/ci.yml` with jobs: `install`, `lint`, `typecheck`, `test`, `build`. Use `oven-sh/setup-bun@v2`.
- [ ] **Step 2:** Push to a temp branch; verify CI green on empty repo.
- [ ] **Step 3:** Commit `ci: add bun workflow`.

### Task 0.4: Bootstrap each workspace package as empty hello-world

- [ ] **Step 1:** For each of `apps/web`, `apps/server`, `packages/{api,db,domain,transport,providers,ui}`: create `package.json` with `name`, `private: true`, `main`, `exports`, `scripts.{typecheck,test,build}`, and own `tsconfig.json` extending `tsconfig.base.json`.
- [ ] **Step 2:** Create one smoke file per package (`src/index.ts` exporting a single constant) so typecheck passes.
- [ ] **Step 3:** Run `bun run typecheck` at root — all green.
- [ ] **Step 4:** Commit `chore: scaffold workspaces`.

---

## Phase 1 — Database Layer (Drizzle + bun:sqlite)

**Goal:** Replace the legacy 1.6k-LOC `EventStore` with typed Drizzle schema, migrations, and a query layer that's easy to reason about.

**Files:**
- Create: `packages/db/src/{schema,migrations,client,queries,index}.ts`
- Create: `packages/db/drizzle.config.ts`
- Test: `packages/db/test/{schema,queries}.test.ts`

### Task 1.1: Install dependencies and configure Drizzle

- [ ] **Step 1:** `cd packages/db && bun add drizzle-orm && bun add -d drizzle-kit`
- [ ] **Step 2:** Create `drizzle.config.ts` pointing to `src/schema.ts`, `out: ./src/migrations`, `dialect: "sqlite"`. (Runtime uses `drizzle-orm/bun-sqlite`; drizzle-kit reads SQL only, so the dialect string is sufficient — no driver field needed.)
- [ ] **Step 3:** Commit `feat(db): install drizzle`.

### Task 1.2: Define schema (TDD)

- [ ] **Step 1:** Write `packages/db/test/schema.test.ts` asserting that the imported schema exports `chats`, `messages`, `events`, `runners`, `worktrees`, `claims`, `todos`, `rules`, `pushSubscriptions`, `kvStore` tables.
- [ ] **Step 2:** Run `bun test packages/db` — expect FAIL (no schema).
- [ ] **Step 3:** Implement `packages/db/src/schema.ts`:

```ts
import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core"

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  projectPath: text("project_path").notNull(),
  title: text("title"),
  provider: text("provider", { enum: ["claude", "codex"] }).notNull(),
  status: text("status", { enum: ["idle", "running", "error"] }).notNull().default("idle"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({ byProject: index("chats_project_idx").on(t.projectPath) }))

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  body: text("body", { mode: "json" }).notNull(),
  ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({ byChat: index("messages_chat_idx").on(t.chatId, t.ts) }))

export const events = sqliteTable("events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({ byChat: index("events_chat_idx").on(t.chatId, t.seq) }))

// Coordination tables
export const runners = sqliteTable("runners", { /* id, status, agentId, projectPath, lastHeartbeat */ })
export const worktrees = sqliteTable("worktrees", { /* id, repoPath, branch, runnerId */ })
export const claims = sqliteTable("claims", { /* id, todoId, runnerId, claimedAt */ })
export const todos = sqliteTable("todos", { /* id, title, priority, status, projectPath */ })
export const rules = sqliteTable("rules", { /* id, scope, body */ })
export const pushSubscriptions = sqliteTable("push_subscriptions", { /* endpoint, p256dh, auth, ua */ })
export const kvStore = sqliteTable("kv_store", { key: text("key").primaryKey(), value: text("value", { mode: "json" }), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() })
```

- [ ] **Step 4:** Run test — expect PASS.
- [ ] **Step 5:** Commit `feat(db): add core schema`.

### Task 1.3: Generate initial migration

- [ ] **Step 1:** `bunx drizzle-kit generate` — produces `0000_initial.sql` under `src/migrations`.
- [ ] **Step 2:** Inspect SQL; verify all tables + indexes present.
- [ ] **Step 3:** Commit `feat(db): generate initial migration`.

### Task 1.4: Database client + migrator

- [ ] **Step 1:** Write test asserting `createDb(filePath)` returns a Drizzle instance and that running `migrate(db)` creates all tables (use `:memory:`).
- [ ] **Step 2:** Implement `packages/db/src/client.ts`:

```ts
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "./schema"

export function createDb(filePath: string) {
  const sqlite = new Database(filePath)
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
  return drizzle(sqlite, { schema })
}
export { migrate }
export type Db = ReturnType<typeof createDb>
```

- [ ] **Step 3:** Run test — PASS.
- [ ] **Step 4:** Commit `feat(db): add client + migrator`.

### Task 1.5: Query layer (one file per aggregate)

- [ ] **Step 1:** Write tests for: `appendEvent`, `listEventsForChat`, `createChat`, `updateChatStatus`, `appendMessage`, `claimTodo`, `releaseClaim`, `assignWorktree`, `kvGet`, `kvSet`. Each test seeds in-memory DB and asserts behavior including conflict handling (e.g., double-claim throws).
- [ ] **Step 2:** Run tests — all FAIL.
- [ ] **Step 3:** Implement `packages/db/src/queries/{chats,messages,events,coordination,kv}.ts`. Keep each file <200 LOC.
- [ ] **Step 4:** Run tests — all PASS.
- [ ] **Step 5:** Commit `feat(db): add query layer`.

### Task 1.6: Replay helper for legacy event-store import

- [ ] **Step 1:** Write test fixture mimicking the legacy NDJSON event log; assert `importLegacyEvents(db, path)` populates events + derives chats.
- [ ] **Step 2:** Implement `packages/db/src/legacy-import.ts`.
- [ ] **Step 3:** Run test — PASS. Commit `feat(db): legacy import shim`.

### Task 1.7: Snapshot writer (write-through cache for fast hydration)

**Why:** v1 used JetStream KV to cache derived chat snapshots so PWA resume gets full state in one fetch. We need the same shape on top of `kvStore`.

- [ ] **Step 1:** TDD: writing a chat event triggers `writeSnapshot(chatId)`; reading via `readSnapshot(chatId)` returns the derived state in one query.
- [ ] **Step 2:** Implement `packages/db/src/snapshot.ts` exposing `writeSnapshot(db, chatId)` (calls chat reducer + persists to `kvStore` keyed `snapshot:chat:<id>`) and `readSnapshot(db, chatId)`.
- [ ] **Step 3:** Tests PASS. Commit `feat(db): snapshot write-through`.

---

## Phase 2 — Domain Package (pure business logic)

**Goal:** All chat / runner / coordination rules expressed as pure functions and XState machines, with no IO. Wraps the new behavioral spine.

**Files:**
- Create: `packages/domain/src/{chat,runner,coordination,prompt,types,index}.ts`
- Create: `packages/domain/src/machines/{appState,runner,session}.ts`

### Task 2.1: Define domain types and Zod schemas

- [ ] **Step 1:** TDD: assert `ChatSchema.parse(valid)` succeeds and rejects bad input.
- [ ] **Step 2:** Implement `packages/domain/src/types.ts` with Zod schemas for `Chat`, `Message`, `Event`, `Turn`, `RunnerStatus`, `ToolCall`, `AskUserQuestion`, `PresentContent`. Export inferred TS types.
- [ ] **Step 3:** Commit `feat(domain): types and schemas`.

### Task 2.2: Chat reducer (event → state)

- [ ] **Step 1:** Write tests covering: empty chat → empty state; `MessageAdded` event appends; `TurnStarted`/`TurnFinished` adjust status; out-of-order events still produce deterministic snapshot.
- [ ] **Step 2:** Implement `packages/domain/src/chat/reducer.ts` as a pure `(state, event) => state` reducer.
- [ ] **Step 3:** Tests PASS. Commit `feat(domain): chat reducer`.

### Task 2.3: Tool-call grouping (replaces `CollapsedToolGroup`)

- [ ] **Step 1:** Write tests asserting that consecutive tool calls of the same category collapse into one group; ungroup when interleaved with text; preserve ordering.
- [ ] **Step 2:** Implement `packages/domain/src/chat/groupToolCalls.ts`. Tests PASS.
- [ ] **Step 3:** Commit `feat(domain): tool grouping`.

### Task 2.4: XState machines

- [ ] **Step 1:** `bun add xstate` in `packages/domain`.
- [ ] **Step 2:** TDD: write `machines/runner.test.ts` driving the runner machine through `idle → starting → running → cancelled` and asserting actions emitted.
- [ ] **Step 3:** Implement `packages/domain/src/machines/runner.ts` using `setup({ types, actions, guards })`. Same pattern for `session.ts` and `appState.ts`.
- [ ] **Step 4:** Tests PASS. Commit `feat(domain): xstate machines`.

### Task 2.5: Session orchestrator machine

**Why:** v1's `SessionOrchestrator` (~500 LOC) owns runner spawning, lifecycle, and dispatches turns to providers. We split it into a pure machine here + a thin server adapter in Phase 5.

- [ ] **Step 1:** TDD: machine transitions `idle → spawning_runner → ready → turn_in_flight → ready → cancelled/error`, with side-effect actions: `spawnRunner`, `assignWorktree`, `dispatchTurn`, `cancelTurn`, `disposeRunner`.
- [ ] **Step 2:** Implement `packages/domain/src/machines/sessionOrchestrator.ts`. Pure — no IO; actions are declared, executed by the server.
- [ ] **Step 3:** Tests PASS. Commit `feat(domain): session orchestrator machine`.

### Task 2.6: Delegation coordinator machine

**Why:** v1's `delegation-coordinator.ts` (~370 LOC) tracks parent→child subagent relationships and aggregates child results back to the parent. Without this, subagent dispatch silently does nothing — the SubagentIndicator UI in Phase 7 would show empty.

- [ ] **Step 1:** TDD: dispatching a child task creates a delegation row with `parentTurnId`; child completion publishes a `delegation_result` event consumed by parent reducer; cancellation cascades parent → children.
- [ ] **Step 2:** Implement `packages/domain/src/coordination/delegation.ts` (pure: `dispatch(state, cmd)`, `applyResult(state, evt)`, `cascadeCancel(state, parentId)`).
- [ ] **Step 3:** Tests PASS. Commit `feat(domain): delegation coordinator`.

### Task 2.7: Prompt builders

- [ ] **Step 1:** Tests for `buildMergePrompt(chats)`, `buildForkPrompt(chat)` with truncation rules; covers `truncateLine`.
- [ ] **Step 2:** Implement `packages/domain/src/prompt/{merge,fork,truncate}.ts`. Tests PASS.
- [ ] **Step 3:** Commit `feat(domain): prompt builders`.

---

## Phase 3 — Transport Package (NATS Core + SSE + WS helpers)

**Goal:** Thin, replaceable transport. Multi-runner coordination uses NATS Core only (no JetStream/KV — that responsibility moved to SQLite). UI ↔ server uses SSE for streams + WS for terminal I/O.

**Files:**
- Create: `packages/transport/src/{nats,sse,ws,types,index}.ts`
- Test: `packages/transport/test/*.test.ts`

### Task 3.1: NATS Core wrapper

- [ ] **Step 1:** `bun add nats @nats-io/nats-core` in `packages/transport`.
- [ ] **Step 2:** TDD: spin up an embedded test NATS server (use `nats-server` test helper or stub); assert `publish('subject', payload)` → `subscribe('subject', cb)` round-trips a JSON-encoded message.
- [ ] **Step 3:** Implement `packages/transport/src/nats.ts` exposing `connectNats(opts)`, `Publisher`, `Subscription`. Wrap in Zod-validated codec.
- [ ] **Step 4:** Tests PASS. Commit `feat(transport): nats core wrapper`.

### Task 3.2: SSE helper

- [ ] **Step 1:** TDD with a `Hono` test client: register an SSE handler that streams `["a","b","c"]`; the client receives 3 events.
- [ ] **Step 2:** Implement `packages/transport/src/sse.ts` exporting `sse(handler: (emit) => Promise<void>)` returning a `Response` with `text/event-stream`.
- [ ] **Step 3:** Tests PASS. Commit `feat(transport): sse helper`.

### Task 3.3: Typed WS channel for terminal I/O

- [ ] **Step 1:** TDD: assert encode/decode of `{kind: "data" | "resize" | "exit", ...}` envelopes with Zod.
- [ ] **Step 2:** Implement `packages/transport/src/ws.ts` defining envelope schemas + a small `wireUpTerminalSocket(server, terminalManager)` adapter.
- [ ] **Step 3:** Tests PASS. Commit `feat(transport): terminal ws envelopes`.

---

## Phase 4 — Providers Package (Claude SDK + Codex)

**Goal:** Adapters that turn provider events into domain events. Replaces `runner-proxy.ts` + `codex-app-server.ts` + `runtime-registry.ts`.

**Files:**
- Create: `packages/providers/src/{claude,codex,registry,types,index}.ts`
- Create: `packages/providers/src/codex/{server,protocol,parse}.ts` (split the old 950-LOC monolith)

### Task 4.1: Provider interface

- [ ] **Step 1:** Define `Provider` interface in `types.ts` with `start(turn)`, `cancel()`, `send(message)`, async iterator `events()`.
- [ ] **Step 2:** Add Zod schemas for `ProviderEvent` discriminated union.
- [ ] **Step 3:** Commit `feat(providers): interface`.

### Task 4.2: Claude adapter

- [ ] **Step 1:** `bun add @anthropic-ai/claude-agent-sdk` in `packages/providers`.
- [ ] **Step 2:** TDD against a stub SDK: assert that calling `start({ prompt })` emits `text-delta`, `tool-call`, `turn-finished` events in order.
- [ ] **Step 3:** Implement `packages/providers/src/claude.ts`. Keep ≤200 LOC.
- [ ] **Step 4:** Tests PASS. Commit `feat(providers): claude adapter`.

### Task 4.3: Codex adapter (split into 3 files)

- [ ] **Step 1:** Tests for each piece:
  - `protocol.test.ts`: parse a fixture transcript line into typed events.
  - `parse.test.ts`: stream parser handles partial lines, recovers from junk.
  - `server.test.ts`: spawn a fake codex binary (`scripts/fake-codex.ts`), assert lifecycle: spawn → ready → message → exit.
- [ ] **Step 2:** Implement `packages/providers/src/codex/{protocol,parse,server}.ts`. Each ≤200 LOC. Use `execa` for spawn.
- [ ] **Step 3:** Tests PASS. Commit `feat(providers): codex adapter`.

### Task 4.4: Provider registry

- [ ] **Step 1:** TDD: registry resolves `provider: "claude"` to claude adapter, `"codex"` to codex; throws on unknown.
- [ ] **Step 2:** Implement `registry.ts`.
- [ ] **Step 3:** Tests PASS. Commit `feat(providers): registry`.

### Task 4.5: Quick response (structured codex output)

**Why:** v1's `quick-response.ts` exposes a one-shot, non-streaming structured-output call to Codex (used by features like background title generation). Different shape from the streaming provider interface — separate adapter avoids polluting the main one.

- [ ] **Step 1:** TDD: `runCodexStructured({ prompt, schema })` returns a Zod-validated typed result; rejects on schema mismatch.
- [ ] **Step 2:** Implement `packages/providers/src/codex/quickResponse.ts` using `execa` to spawn codex with the structured-output flag. ≤120 LOC.
- [ ] **Step 3:** Tests PASS. Commit `feat(providers): codex quick response`.

### Task 4.6: Background title generator

**Why:** v1's runner agent calls `generateTitleInBackground` after the first user message. Small but visible — chat tabs without titles feel broken.

- [ ] **Step 1:** TDD: given a chat with one user message, `generateTitle(chat)` returns a short title via the configured provider; failures are swallowed (returns null).
- [ ] **Step 2:** Implement `packages/providers/src/titleGenerator.ts` reusing `quickResponse` for codex and a one-shot Claude call for claude.
- [ ] **Step 3:** Tests PASS. Commit `feat(providers): background title gen`.

---

## Phase 5 — Server (Hono + tRPC + integration)

**Goal:** A working HTTP/WS server backing the API + serving the SPA. Wires DB + domain + transport + providers together.

**Files:**
- Create: `apps/server/src/{index,context,trpc,routes,terminal,sandbox,push,share,sse-streams}.ts`
- Create: `packages/api/src/{router,routers/*,context,index}.ts`
- Test: `apps/server/test/*.test.ts`, `packages/api/test/*.test.ts`

### Task 5.1: tRPC bootstrap

- [ ] **Step 1:** `bun add @trpc/server@next zod` in `packages/api`.
- [ ] **Step 2:** Implement `packages/api/src/trpc.ts`: `initTRPC.context<Context>().create()` with `procedure`, `router`, `middleware`.
- [ ] **Step 3:** Define `Context` containing `db: Db`, `nats: NatsClient`, `userId: string`.
- [ ] **Step 4:** Commit `feat(api): trpc bootstrap`.

### Task 5.2: Routers (one per concern)

- [ ] **Step 1:** TDD per router: `chats`, `messages`, `runners`, `worktrees`, `todos`, `rules`, `prefs`, `share`, `push`, **`workspaces`** (list/add/remove projects + per-project config), **`skills`** (discovery list + reload), **`providers`** (list catalog + health + set defaults), **`sandbox`** (status + restart), **`repo`** (git status / branch / current head). For each, write tests asserting `query` and `mutation` shape with mocked context.
- [ ] **Step 2:** Implement `packages/api/src/routers/*.ts`. Compose into `appRouter` in `router.ts`. Export type `AppRouter`.
- [ ] **Step 3:** Tests PASS. Commit `feat(api): routers`.

### Task 5.3: Hono server

- [ ] **Step 1:** `bun add hono @hono/trpc-server` in `apps/server`.
- [ ] **Step 2:** TDD: `app.fetch(new Request("/health"))` returns `200 ok`.
- [ ] **Step 3:** Implement `apps/server/src/index.ts` mounting:
  - `/trpc/*` via `@hono/trpc-server`
  - `/health` smoke
  - `/sse/chat/:id` streaming token deltas
  - `/ws/terminal/:id` (Bun upgrade)
  - `/api/push/{subscribe,unsubscribe}`
  - `/share/:token` (read-only viewer)
  - Static assets from `apps/web/dist`
- [ ] **Step 4:** Tests PASS. Commit `feat(server): hono mount`.

### Task 5.4: SSE wiring for chat streams

- [ ] **Step 1:** TDD: posting a turn via tRPC → SSE stream emits the same events to a connected client.
- [ ] **Step 2:** Implement `apps/server/src/sse-streams.ts` bridging NATS Core → SSE per chat.
- [ ] **Step 3:** Tests PASS. Commit `feat(server): sse chat stream`.

### Task 5.4a: SSE reconnect + replay-from-seq

**Why:** SSE auto-reconnects but the server must honor `Last-Event-ID` and replay missed events from the SQLite event log so the client never misses a message after a brief disconnect (PWA backgrounding, network blip).

- [ ] **Step 1:** TDD: connect, receive 3 events, disconnect, reconnect with `Last-Event-ID: 2`; expect events 3+ replayed first then live tail.
- [ ] **Step 2:** Extend `sse-streams.ts`: read `Last-Event-ID` header, replay from `events.seq > N` via `listEventsForChat`, then attach to NATS subject for live tail.
- [ ] **Step 3:** Tests PASS. Commit `feat(server): sse replay + reconnect`.

### Task 5.4b: DB → NATS publish bridge

**Why:** Without this, events written to SQLite never reach SSE subscribers — multi-tab and multi-client scenarios silently break.

- [ ] **Step 1:** TDD: calling `appendEvent` triggers a NATS publish on `chat.<id>.events` with the same payload + seq.
- [ ] **Step 2:** Implement `apps/server/src/db-publisher.ts` — wrap the `appendEvent` query with a publish hook (NOT a Drizzle middleware; a thin service-layer wrapper invoked by the orchestrator). Same for snapshot updates on `snapshot.<id>`.
- [ ] **Step 3:** Tests PASS. Commit `feat(server): db→nats publish bridge`.

### Task 5.4c: Auth / share token middleware

**Why:** Local-first means no per-user login, but the share viewer + remote tunneling need bearer-token gating. Also blocks accidental cross-origin curl.

- [ ] **Step 1:** TDD: requests without `Authorization: Bearer <local-token>` get 401, except `/health`, `/share/:token` (which validates a separate scoped token), and the SPA static assets.
- [ ] **Step 2:** Implement `apps/server/src/middleware/auth.ts`. Local token generated on first run, written to `~/.tinkaria/token`, served to the SPA via injected `<meta name="token">`.
- [ ] **Step 3:** Tests PASS. Commit `feat(server): auth middleware`.

### Task 5.5: Terminal manager (PTY)

- [ ] **Step 1:** `bun add node-pty execa` in `apps/server`.
- [ ] **Step 2:** TDD: `createTerminal({ cwd, shell })` produces a session; `write("ls\n")` triggers data callback containing `ls`. Use the `default-shell` resolution helper.
- [ ] **Step 3:** Implement `apps/server/src/terminal.ts` (≤300 LOC). Filter focus reports; track size; handle resize.
- [ ] **Step 4:** Tests PASS. Commit `feat(server): terminal manager`.

### Task 5.6: Sandbox lifecycle (Docker)

- [ ] **Step 1:** TDD with `dockerode` mock: assert health monitor reports `unhealthy` when container exits.
- [ ] **Step 2:** Implement `apps/server/src/sandbox.ts` (health monitor + journey publisher).
- [ ] **Step 3:** Tests PASS. Commit `feat(server): sandbox lifecycle`.

### Task 5.6a: Repo manager (git)

**Why:** v1's `repo-manager.ts` provides git operations needed by coordination (worktree create/remove), share (current branch), and the navbar repo label. Don't shell out to `git` ad-hoc throughout the code — wrap once.

- [ ] **Step 1:** TDD with a temp git repo: assert `addLocal(path)` registers the repo, `currentBranch(repoId)` returns the head ref, `createWorktree(repoId, branch)` produces a working tree on disk.
- [ ] **Step 2:** Implement `apps/server/src/repo.ts` using `execa` for git commands; persist registered repos in SQLite (extend schema with `repos` table — add to Phase 1 schema during this task and regenerate migration).
- [ ] **Step 3:** Tests PASS. Commit `feat(server): repo manager`.

### Task 5.6b: Live session discovery

**Why:** Without this, the user opens v2 and sees no chats — even though they have active Claude/Codex sessions on disk. v1's `session-discovery.ts` parses `~/.claude/projects/**/sessions/*.jsonl` and Codex transcripts, surfaces them as resumable chats.

- [ ] **Step 1:** TDD: feed a fixture directory; assert `discoverSessions(roots)` yields chat records with provider, projectPath, last-message timestamp.
- [ ] **Step 2:** Implement `apps/server/src/session-discovery.ts`. Use `chokidar` (or Bun's native `watch`) to watch the directories; new sessions auto-appear. Store discovery results in `chats` table with `source: "discovered"`.
- [ ] **Step 3:** Wire into the `chats.list` tRPC query so the sidebar shows discovered + native chats together.
- [ ] **Step 4:** Tests PASS. Commit `feat(server): live session discovery`.

### Task 5.7: Push notifications

- [ ] **Step 1:** `bun add web-push` in `apps/server`.
- [ ] **Step 2:** TDD: `sendPush(subscription, payload)` calls `web-push.sendNotification` with VAPID keys; on `410 gone` the row is deleted.
- [ ] **Step 3:** Implement `apps/server/src/push.ts` + tRPC `push` router endpoints.
- [ ] **Step 4:** Tests PASS. Commit `feat(server): push notifications`.

### Task 5.8: Share / cloudflared tunnel

- [ ] **Step 1:** TDD: starting share creates a row + spawns `cloudflared` (mocked); stopping kills it.
- [ ] **Step 2:** Implement `apps/server/src/share.ts`. Includes QR code generation (`bun add qrcode`) — tRPC endpoint `share.create` returns `{ url, qrPng: base64 }` so mobile pairing works.
- [ ] **Step 3:** Tests PASS. Commit `feat(server): share + qr`.

### Task 5.9: Coordination MCP server

- [ ] **Step 1:** `bun add @modelcontextprotocol/sdk` in `apps/server`.
- [ ] **Step 2:** TDD: MCP server exposes `claim_todo`, `release`, `assign_worktree`, `list_rules`; integration test calls each via the SDK.
- [ ] **Step 3:** Implement `apps/server/src/coordination-mcp.ts`.
- [ ] **Step 4:** Tests PASS. Commit `feat(server): coordination mcp`.

### Task 5.9a: Runner-side NATS coordination client

**Why:** Runners (which may live in worktrees, possibly on different hosts later) need a thin NATS publisher to claim todos / release / heartbeat. Mirrors v1's `runner/nats-coordination-client.ts`.

- [ ] **Step 1:** TDD: `client.claimTodo(id)` publishes on `coord.claim`, listens for ack on `coord.claim.ack.<runnerId>`.
- [ ] **Step 2:** Implement `packages/transport/src/coordinationClient.ts` (lives in transport package because both server and runner need it).
- [ ] **Step 3:** Tests PASS. Commit `feat(transport): runner coordination client`.

### Task 5.9b: Workspace config manager

**Why:** v1's `workspace-config-manager.ts` persists per-project settings (provider preferences, terminal layout, custom rules) so that switching projects restores its state.

- [ ] **Step 1:** TDD: `getConfig(projectPath)` returns defaults if absent; `setConfig(projectPath, patch)` merges and persists; `watchConfig(projectPath, cb)` fires on changes.
- [ ] **Step 2:** Implement `apps/server/src/workspace-config.ts` backed by `kvStore` table keyed `workspace:<sha>:config`. Wire into `workspaces` tRPC router.
- [ ] **Step 3:** Tests PASS. Commit `feat(server): workspace config manager`.

### Task 5.10: CLI entry + lifecycle

- [ ] **Step 1:** TDD: `parseArgs(["--port", "5180"])` returns `{ port: 5180 }`. Invalid → exit 1 with help.
- [ ] **Step 2:** Implement `apps/server/src/cli.ts`: arg parsing, port selection, DB migration on boot, NATS embedded boot, graceful shutdown on SIGINT.
- [ ] **Step 3:** Manual smoke: `bun run apps/server/src/cli.ts --port 5180` → `curl localhost:5180/health` returns ok.
- [ ] **Step 4:** Commit `feat(server): cli entry`.

---

## Phase 6 — Web App Shell (Vite + React + Router + Query + Theme)

**Goal:** A blank app that boots, routes, fetches data via tRPC + Query, themes light/dark.

**Files:**
- Create: `apps/web/{index.html,vite.config.ts,src/main.tsx,src/App.tsx,src/router.tsx,src/trpc.ts}`
- Create: `apps/web/src/{providers/QueryProvider.tsx,providers/ThemeProvider.tsx}`

### Task 6.1: Vite + React + Tailwind

- [ ] **Step 1:** `cd apps/web && bun add react@19 react-dom@19 && bun add -d vite @vitejs/plugin-react tailwindcss @tailwindcss/postcss @tailwindcss/typography autoprefixer`
- [ ] **Step 2:** `vite.config.ts` with proxy to backend (`/trpc`, `/sse`, `/ws`) on port 5180. Strict port for dev (5174).
- [ ] **Step 3:** Create Tailwind 4 config; add `index.css` with `@import "tailwindcss"`.
- [ ] **Step 4:** Run `bun run dev` from web; expect blank page on :5174.
- [ ] **Step 5:** Commit `feat(web): vite + tailwind`.

### Task 6.2: TanStack Router file-based routing

- [ ] **Step 1:** `bun add @tanstack/react-router && bun add -d @tanstack/router-plugin`
- [ ] **Step 2:** Configure router plugin in `vite.config.ts`; create `src/routes/{__root.tsx,index.tsx,projects/$projectId.tsx,chats/$chatId.tsx,settings.tsx,share/$token.tsx}`.
- [ ] **Step 3:** TDD a smoke test using `@tanstack/router` test helpers asserting `/` renders `Home`.
- [ ] **Step 4:** Tests PASS. Commit `feat(web): tanstack router`.

### Task 6.3: tRPC + TanStack Query client

- [ ] **Step 1:** `bun add @trpc/client@next @trpc/react-query@next @tanstack/react-query`
- [ ] **Step 2:** Implement `src/trpc.ts` exporting `trpc` (typed against `AppRouter` from `packages/api`) and `trpcClient`.
- [ ] **Step 3:** Wrap app in `QueryClientProvider` + `trpc.Provider`.
- [ ] **Step 4:** TDD: render a component that calls `trpc.health.useQuery()`; mock fetch returns `{ ok: true }`; assert text appears.
- [ ] **Step 5:** Commit `feat(web): trpc + query`.

### Task 6.4: Theme provider + dark mode toggle

- [ ] **Step 1:** TDD: `applyThemeClass("dark")` sets `<html class="dark">`; persists in `localStorage`.
- [ ] **Step 2:** Implement `providers/ThemeProvider.tsx` (system / light / dark).
- [ ] **Step 3:** Tests PASS. Commit `feat(web): theme provider`.

### Task 6.5: shadcn/ui base setup

- [ ] **Step 1:** `bunx shadcn@latest init` — pick Tailwind 4, Slate, CSS variables.
- [ ] **Step 2:** Add base components: `button`, `dialog`, `dropdown-menu`, `popover`, `tooltip`, `select`, `context-menu`, `alert-dialog`, `card`, `scroll-area`, `tabs`, `command` (cmdk), `sonner`. Each via `bunx shadcn@latest add <name>`.
- [ ] **Step 3:** Smoke render a `<Button>` on the index route.
- [ ] **Step 4:** Commit `feat(web): shadcn base`.

---

## Phase 7 — Chat UI

**Goal:** Sidebar with project/chat tree, chat transcript with streaming, message input, navbar, scroll-follow behavior.

**Files:**
- Create: `apps/web/src/features/chat/{ChatPage,ChatTranscript,ChatInput,ChatNavbar,ChatNavigator,Sidebar}.tsx`
- Create: `apps/web/src/features/chat/messages/{TextMessage,ToolCallMessage,SystemMessage,AskUserQuestionMessage,PresentContentMessage,CollapsedToolGroup,LocalFilePreviewDialog,SubagentIndicator,EditDiffView}.tsx`
- Create: `apps/web/src/features/chat/hooks/{useScrollFollow,useStickyChatFocus,useChatStream}.ts`
- Create: `apps/web/src/stores/{chatPreferences,terminalLayout,rightSidebar,skillComposition}.ts`

### Task 7.1: Sidebar (project list + chat rows)

- [ ] **Step 1:** TDD: render with mocked tRPC; clicking a chat row navigates to `/chats/:id`.
- [ ] **Step 2:** Implement `Sidebar.tsx` using `trpc.chats.list.useQuery({ projectPath })`. Use `@tanstack/react-virtual` for long lists.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): sidebar`.

### Task 7.2: ChatTranscript with streaming via SSE

- [ ] **Step 1:** Implement `useChatStream(chatId)` hook: opens `EventSource("/sse/chat/:id")`, applies events to TanStack Query cache via `setQueryData`.
- [ ] **Step 2:** TDD: stub EventSource; assert messages array grows.
- [ ] **Step 3:** Implement `ChatTranscript.tsx` that maps `messages` through the message components. Use `@tanstack/react-virtual` for long transcripts.
- [ ] **Step 4:** Tests PASS. Commit `feat(chat): transcript + streaming`.

### Task 7.3: Message components (one TDD pass per type)

- [ ] **Step 1–N:** For each of the 14 message types (text, tool-call, ask-user-question, present-content, collapsed-group, system, status, account-info, result, interrupted, raw-json, todo-write, env-changed, edit-diff): write snapshot/behavior test, implement, commit. Use shadcn primitives + `react-markdown` + `streamdown` + Shiki.

### Task 7.4: ChatInput with queueing + skill insertion

- [ ] **Step 1:** TDD covering `shouldQueueOnSubmitKeystroke`, `shouldClearDraftAfterSubmit`, `handleRestoreQueuedText`, skill-prefix detection.
- [ ] **Step 2:** Implement `ChatInput.tsx` using React Hook Form + autosize textarea + cmdk for skill picker.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): input + queue + skills`.

### Task 7.5: ChatNavbar + ChatNavigator (waypoints)

- [ ] **Step 1:** TDD navigator visibility logic.
- [ ] **Step 2:** Implement; bind to scroll-follow store.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): navbar + navigator`.

### Task 7.6: Scroll-follow + sticky focus

- [ ] **Step 1:** TDD `useScrollFollow` state machine: user scrolls up → unstick; user reaches bottom → re-stick; new message during stuck → auto-scroll.
- [ ] **Step 2:** Implement using a small zustand store + IntersectionObserver.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): scroll follow`.

### Task 7.7: Mobile sidebar swipe gesture

- [ ] **Step 1:** TDD `mobileSidebarSwipeDecision` (touchstart/move/end fixtures).
- [ ] **Step 2:** Implement gesture handler.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): mobile swipe`.

### Task 7.8: Right sidebar (toggle, layout, animation)

**Why:** v1's right sidebar holds coordination panels, sandbox panel, providers tab. Toggle animation is non-trivial (spring + measured-width).

- [ ] **Step 1:** TDD: `useRightSidebar` returns `{ open, toggle, width }`; `setWidth` clamps to `[280, 720]`; persisted to `rightSidebarStore`.
- [ ] **Step 2:** Implement `RightSidebar.tsx` using react-resizable-panels for the gutter, Motion `<motion.aside>` for collapse animation. Per-project layout via `withProjectLayout` helper.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): right sidebar`.

### Task 7.9: Chat preferences store (provider defaults, composer state)

**Why:** v1's `chatPreferencesStore` normalizes provider defaults (Claude reasoning effort, Codex model) and composer state. Without explicit normalization helpers users lose settings on schema bumps.

- [ ] **Step 1:** TDD: `normalizeClaudePreference` rejects invalid reasoning effort + falls back to default; `composerFromProviderDefaults(prefs)` produces consistent composer state.
- [ ] **Step 2:** Implement `stores/chatPreferencesStore.ts` (Zustand + persist middleware). Include normalization on rehydrate.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): preferences store`.

### Task 7.10: Chat focus policy (text-entry detection)

**Why:** Needed by keyboard shortcuts (Task 7.13) so global shortcuts don't fire while typing. Also gates auto-focus behavior.

- [ ] **Step 1:** TDD `isTextEntryTarget(node)`: true for `<input>`, `<textarea>`, `[contenteditable]`, false otherwise.
- [ ] **Step 2:** Implement `lib/chatFocusPolicy.ts`.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): focus policy`.

### Task 7.11: LocalFilePreviewDialog enhancements

**Why:** v1's preview dialog detects markdown, ASCII trees, and code; renders with appropriate component. Skipping the detectors makes file previews look like raw text dumps.

- [ ] **Step 1:** TDD `getLocalFilePreviewType(path, content)` returns `markdown | ascii-tree | code | text`; `isAsciiTreeLine` detects tree-drawing chars.
- [ ] **Step 2:** Implement `LocalFilePreviewDialog.tsx` using detector + react-markdown + Shiki + a tree renderer for ASCII trees.
- [ ] **Step 3:** Tests PASS. Commit `feat(chat): local file preview detectors`.

### Task 7.12: Sandbox panel + subscription

**Why:** Server-side sandbox health monitor exists (P5.6) but the user can't see status without this.

- [ ] **Step 1:** TDD: `useSandboxSubscription` opens SSE on `/sse/sandbox/:projectId`, exposes status reactively.
- [ ] **Step 2:** Implement `features/coordination/SandboxPanel.tsx` showing container status, last error, restart action.
- [ ] **Step 3:** Tests PASS. Commit `feat(coord): sandbox panel`.

### Task 7.13: Keyboard shortcuts + ShortcutHelpOverlay

**Why:** Power users live on shortcuts. v1 has scoped+grouped shortcuts (`Cmd+K`, `Cmd+Enter`, `Esc` to cancel turn, etc.) with a `?` help overlay.

- [ ] **Step 1:** TDD `matchesShortcut`, `isShortcutActive(scope)`, `groupByScope`. Cover: modifier matching across mac/win, scope priority, ignore-when-typing (uses `chatFocusPolicy`).
- [ ] **Step 2:** Implement `hooks/useShortcuts.ts` and `components/ui/ShortcutHelpOverlay.tsx` (cmdk-styled list grouped by scope).
- [ ] **Step 3:** Register baseline shortcuts: `?` → help, `Cmd+Enter` → submit, `Esc` → cancel turn, `Cmd+K` → command palette, `Cmd+B` → toggle sidebar, `Cmd+J` → toggle terminal.
- [ ] **Step 4:** Tests PASS. Commit `feat(chat): keyboard shortcuts`.

### Task 7.14: NewWorkspaceModal + LocalDev panel

**Why:** Without these the user can't add a new project. Hard dead-end on first open.

- [ ] **Step 1:** TDD: submitting `NewWorkspaceModal({ path, name })` calls `trpc.workspaces.add.useMutation`; on success closes + navigates to `/projects/$id`.
- [ ] **Step 2:** Implement `NewWorkspaceModal.tsx` (Radix Dialog + React Hook Form + path picker). Implement `LocalDev.tsx` listing local projects with status dot + open button.
- [ ] **Step 3:** Wire from sidebar empty-state and from a `+` button.
- [ ] **Step 4:** Tests PASS. Commit `feat(workspace): new workspace + local dev panel`.

### Task 7.15: Providers tab (settings)

**Why:** No surface to set Claude reasoning effort, Codex model, default provider, view auth status.

- [ ] **Step 1:** TDD: `ProvidersTab` reads `trpc.providers.catalog.useQuery`; setting a default calls `providers.setDefault.useMutation`.
- [ ] **Step 2:** Implement `app/ProvidersTab.tsx` with `HealthDot`, model selector, reasoning-effort selector (per provider).
- [ ] **Step 3:** Mount under `/settings/providers` route.
- [ ] **Step 4:** Tests PASS. Commit `feat(settings): providers tab`.

---

## Phase 8 — Terminal Pane (xterm.js 5)

**Goal:** Terminal pane that opens a PTY, renders bytes, resizes, animates open/close.

**Files:**
- Create: `apps/web/src/features/terminal/{TerminalPane,TerminalWorkspace,useTerminalSocket,useTerminalToggleAnimation,terminalLayout}.ts(x)`

### Task 8.1: TerminalPane wrapping xterm.js 5 LTS

- [ ] **Step 1:** `bun add xterm@5 xterm-addon-fit xterm-addon-web-links xterm-addon-serialize`
- [ ] **Step 2:** TDD with `happy-dom`: mounting `TerminalPane({ id })` opens WS; received `{kind:"data", bytes}` writes to xterm.
- [ ] **Step 3:** Implement `TerminalPane.tsx` and `useTerminalSocket(id)` hook.
- [ ] **Step 4:** Tests PASS. Commit `feat(terminal): pane`.

### Task 8.2: TerminalWorkspace layout (splits)

- [ ] **Step 1:** `bun add react-resizable-panels`
- [ ] **Step 2:** TDD layout helper `getMinimumTerminalWorkspaceWidth`.
- [ ] **Step 3:** Implement `TerminalWorkspace.tsx`. Persist sizes in `terminalLayoutStore`.
- [ ] **Step 4:** Tests PASS. Commit `feat(terminal): workspace`.

### Task 8.3: Toggle animation via Motion

- [ ] **Step 1:** `bun add motion`
- [ ] **Step 2:** Replace bespoke spline/curve animation with Motion `<motion.div>` `layout` + `AnimatePresence`.
- [ ] **Step 3:** Visual smoke test (Playwright) — open/close terminal, screenshot stable.
- [ ] **Step 4:** Commit `feat(terminal): motion animation`.

### Task 8.4: Terminal preferences (scrollback, font size)

**Why:** Per-user terminal preferences in v1. Scrollback default of 1000 lines is too small for build logs.

- [ ] **Step 1:** TDD: `clampScrollback(n)` clamps to `[100, 10000]`; `terminalPreferencesStore` persists.
- [ ] **Step 2:** Implement `stores/terminalPreferencesStore.ts` (Zustand + persist) and surface in Settings → Terminal.
- [ ] **Step 3:** Apply to xterm via `terminal.options.scrollback = n` on hydrate.
- [ ] **Step 4:** Tests PASS. Commit `feat(terminal): preferences`.

---

## Phase 9 — Coordination UI

**Goal:** Panels for todos, claims, worktrees, rules, agents, workflow runs.

**Files:**
- Create: `apps/web/src/features/coordination/{TodosPanel,WorktreesPanel,ClaimsPanel,RulesPanel,AgentConfigPanel,WorkflowPanel,helpers}.ts(x)`

### Task 9.1: Helpers

- [ ] **Step 1:** TDD `sortTodosByPriority`, `filterTodos`, `isClaimConflicting`, `formatRelativeTimestamp`, `formatTime`.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit `feat(coord): helpers`.

### Task 9.2: TodosPanel

- [ ] **Step 1:** TDD: list query + add/edit/delete mutations via tRPC.
- [ ] **Step 2:** Implement using TanStack Table for sortable columns.
- [ ] **Step 3:** Tests PASS. Commit `feat(coord): todos panel`.

### Task 9.3: WorktreesPanel, ClaimsPanel, RulesPanel, AgentConfigPanel, WorkflowPanel

- [ ] **Step 1–N:** One TDD-implement-commit cycle per panel. Each ≤200 LOC.

---

## Phase 10 — Rich Content (MDX replaces Puggy)

**Goal:** AI-generated rich content rendered via MDX + sandboxed iframe for arbitrary HTML/SVG. Eliminates the Puggy DSL.

**Files:**
- Create: `apps/web/src/features/rich-content/{RichContentBlock,EmbedRenderer,ContentOverlay,ContentViewerContext,mdxComponents}.tsx`

### Task 10.1: MDX runtime

- [ ] **Step 1:** `bun add @mdx-js/mdx @mdx-js/react remark-gfm rehype-shiki`
- [ ] **Step 2:** TDD: rendering an MDX string `# Hi <Button>x</Button>` produces a heading + button.
- [ ] **Step 3:** Implement `compileMdx(source)` (cached) + `<MdxView source />`.
- [ ] **Step 4:** Tests PASS. Commit `feat(rich): mdx runtime`.

### Task 10.2: Iframe sandbox embed

- [ ] **Step 1:** TDD: `<EmbedRenderer language="html" source="<svg>...</svg>" />` mounts an iframe with `sandbox="allow-scripts"` (and not `allow-same-origin`); zoom controls clamp.
- [ ] **Step 2:** Implement `EmbedRenderer` supporting `html`, `svg`, `mermaid`. Drop `pug` entirely.
- [ ] **Step 3:** Tests PASS. Commit `feat(rich): iframe embed`.

### Task 10.3: ContentOverlay (full-screen viewer)

- [ ] **Step 1:** TDD overlay reducer (open/close/zoom/pan).
- [ ] **Step 2:** Implement using Radix Dialog + Motion.
- [ ] **Step 3:** Tests PASS. Commit `feat(rich): overlay`.

---

## Phase 11 — Extensions System

**Goal:** Generic plugin system mirroring the original (`extension-router`, manifest, agents/c3/code clients).

**Files:**
- Create: `packages/api/src/extensions/{types,registry}.ts`
- Create: `apps/server/src/extensions/{router,c3,agents,code}.ts`
- Create: `apps/web/src/features/extensions/{ExtensionHost,extensions.config.ts}`

### Task 11.1: Manifest + registry

- [ ] **Step 1:** TDD: registering an extension by manifest exposes `/api/ext/<id>/...` routes.
- [ ] **Step 2:** Implement registry + Hono mount.
- [ ] **Step 3:** Commit `feat(ext): registry`.

### Task 11.2: Built-ins

- [ ] **Step 1–3:** TDD-implement-commit for `c3`, `agents`, `code` extensions (server + client).

---

## Phase 12 — PWA, Push UX, Updates

**Goal:** Installable PWA with reliable push notifications, auto-update prompt, PWA-resume behavior on visibility/focus/online/pageshow.

**Files:**
- Create: `apps/web/{public/manifest.webmanifest,src/sw.ts,src/hooks/{usePwaResume,usePushNotifications,useIsStandalone,useIsMobile}.ts}`

### Task 12.1: vite-plugin-pwa

- [ ] **Step 1:** `bun add -d vite-plugin-pwa`
- [ ] **Step 2:** Configure with `injectManifest` strategy; precache shell, runtime cache for `/api/*`.
- [ ] **Step 3:** `bun run build`; verify `dist/sw.js` exists.
- [ ] **Step 4:** Commit `feat(pwa): vite-plugin-pwa`.

### Task 12.2: Push subscribe/unsubscribe

- [ ] **Step 1:** TDD: `usePushNotifications` calls `Notification.requestPermission`; on grant subscribes via tRPC `push.subscribe`.
- [ ] **Step 2:** Implement; expose `<NotificationToggle />`.
- [ ] **Step 3:** Tests PASS. Commit `feat(pwa): push UX`.

### Task 12.3: PWA resume

- [ ] **Step 1:** TDD: visibility/focus/online/pageshow events all trigger snapshot reload + subscription reset.
- [ ] **Step 2:** Implement `usePwaResume`.
- [ ] **Step 3:** Tests PASS. Commit `feat(pwa): resume hook`.

### Task 12.4: Update manager

- [ ] **Step 1:** TDD: server publishes `update_available`; client shows reload toast.
- [ ] **Step 2:** Implement client + server sides.
- [ ] **Step 3:** Tests PASS. Commit `feat(pwa): update prompt`.

### Task 12.5: Standalone / mobile detection hooks

**Why:** Used by mobile swipe gesture, install prompt UX, and some layout heuristics.

- [ ] **Step 1:** TDD `getStandaloneMediaQuery`, `getIsMobile` (matchMedia stubbed).
- [ ] **Step 2:** Implement `hooks/useIsStandalone.ts`, `hooks/useIsMobile.ts`.
- [ ] **Step 3:** Tests PASS. Commit `feat(pwa): standalone + mobile hooks`.

### Task 12.6: Persisted store layer

**Why:** Multiple stores (chat prefs, terminal layout/prefs, right sidebar, skill composition) need persistence with migrations. Without a unified layer each store reinvents schema versioning.

- [ ] **Step 1:** `bun add idb-keyval` (or use Zustand's built-in `persist` middleware with `localStorage` for small payloads, IndexedDB for larger).
- [ ] **Step 2:** TDD: `createPersistedStore({ name, version, migrate })` — migration from v1 → v2 transforms shape; corrupted data falls back to defaults.
- [ ] **Step 3:** Implement `lib/persistedStore.ts`. Refactor all stores from Phase 7 / 8 to use it.
- [ ] **Step 4:** Tests PASS. Commit `feat(stores): persisted store layer`.

---

## Phase 13 — Distribution + Observability + E2E

**Goal:** Single-binary distribution, structured logs/metrics, browser-based E2E proving the golden paths.

### Task 13.1: Pino logger

- [ ] **Step 1:** `bun add pino`
- [ ] **Step 2:** TDD: `logger.info({foo:1}, "hi")` writes JSON to a captured stream.
- [ ] **Step 3:** Implement `apps/server/src/logger.ts` and replace `console.*` calls.
- [ ] **Step 4:** Commit `feat(server): pino logger`.

### Task 13.2: OpenTelemetry SDK

- [ ] **Step 1:** `bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node`
- [ ] **Step 2:** Init in `cli.ts` if `OTEL_EXPORTER_OTLP_ENDPOINT` env set.
- [ ] **Step 3:** Smoke test: spans emitted on `/health` request.
- [ ] **Step 4:** Commit `feat(server): otel`.

### Task 13.3: Playwright E2E suite

- [ ] **Step 1:** `bun add -d @playwright/test && bunx playwright install`
- [ ] **Step 2:** Write `e2e/` tests for the 11 golden paths:
  1. Open app → create project → start a chat → message round-trip.
  2. Open terminal → type `echo hello` → see output.
  3. Mobile viewport → swipe sidebar open/close.
  4. Install PWA prompt → service worker registers.
  5. Share read-only viewer renders messages.
  6. **Multi-runner coordination** — claim todo → assign worktree → release.
  7. **Resume after refresh** — start a chat, hard-reload, state restored from snapshot.
  8. **Cancel mid-turn** — stream tokens, hit Esc, server cancels and UI returns to idle.
  9. **MCP coordination** — external client connects via MCP SDK, claims a todo, todo state updates in UI.
  10. **Subagent dispatch** — parent turn triggers child via delegation; SubagentIndicator shows tree, child completes, parent receives result.
  11. **Slash command insertion** — type `/`, picker opens with discovered skills, select inserts text.
- [ ] **Step 3:** Wire into CI (separate job, runs on PR).
- [ ] **Step 4:** Commit `test(e2e): golden paths`.

### Task 13.3a: Performance benchmark scripts

**Why:** Perf budget exists but without scripts we can't tell when it regresses. Mirrors v1's `scripts/perf-nats-baseline.ts` and `bench-compression.ts`.

- [ ] **Step 1:** Implement `scripts/bench-nats.ts` — round-trip latency p50/p95/p99 across 1k publishes; output JSON.
- [ ] **Step 2:** Implement `scripts/bench-sse-stream.ts` — measure time-to-first-token for a stubbed turn.
- [ ] **Step 3:** Add CI step that runs benchmarks weekly, posts results to a `bench-history.jsonl` artifact.
- [ ] **Step 4:** Commit `chore: perf benchmarks`.

### Task 13.4: Single-binary build

- [ ] **Step 1:** Add `bun build --compile --target=bun-darwin-arm64 ./apps/server/src/cli.ts --outfile dist/tinkaria-darwin-arm64`.
- [ ] **Step 2:** Repeat for `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`.
- [ ] **Step 3:** Add `release.yml` GH workflow that runs the matrix on tag push, attaches binaries to release.
- [ ] **Step 4:** Commit `chore: binary distribution`.

### Task 13.5: npm package

- [ ] **Step 1:** Make `apps/server/package.json` publishable: `name`, `version`, `bin: { tinkaria: "./dist/cli.js" }`, `files`.
- [ ] **Step 2:** `bun publish --dry-run` and verify file list.
- [ ] **Step 3:** Commit `chore: publishable package`.

### Task 13.6: Optional Tauri 2 desktop wrapper

- [ ] **Step 1:** `bunx create-tauri-app desktop --template react-ts --manager bun`
- [ ] **Step 2:** Configure Tauri `tauri.conf.json` to load `apps/web/dist` and spawn `apps/server` cli as a sidecar.
- [ ] **Step 3:** `bun tauri dev` smoke.
- [ ] **Step 4:** Commit `feat(desktop): tauri 2 wrapper`.

---

## Phase 14 — Data Migration from Tinkaria v1 (optional)

**Goal:** Read v1 NDJSON event log + provider session transcripts; populate v2 DB.

**Files:** `scripts/migrate-from-v1.ts`

- [ ] **Step 1:** TDD: feed a fixture v1 directory; assert v2 SQLite contains expected chats/messages/events.
- [ ] **Step 2:** Implement `scripts/migrate-from-v1.ts` reusing `packages/db` `legacy-import`.
- [ ] **Step 3:** Document in `README.md`.
- [ ] **Step 4:** Commit `feat(scripts): v1 → v2 migration`.

---

## Cross-Cutting Conventions

### TDD Discipline

Every task follows: **(1) failing test → (2) verify red → (3) minimal code → (4) verify green → (5) commit.** Use the @superpowers:test-driven-development skill if uncertain.

### Commit Style (Conventional Commits)

`feat(<scope>): …`, `fix(<scope>): …`, `chore: …`, `test: …`, `refactor: …`, `docs: …`. Scopes: `db`, `domain`, `transport`, `providers`, `api`, `server`, `web`, `chat`, `terminal`, `coord`, `rich`, `pwa`, `ext`, `e2e`, `desktop`.

### File Size Discipline

If any file grows past **300 LOC** during a task, stop and split. Especially watch:
- `EventStore` replacement (must stay <300 across 4 query files)
- `CodexAppServerManager` replacement (split into `protocol`/`parse`/`server`)
- `NatsSocket` replacement (split into `nats` wrapper + per-feature channels)

### Type Boundary

Only `packages/api/src/router.ts` is the source of truth for client-facing types. The web app imports `type { AppRouter }` and never reaches into server internals.

### Performance Budget

- First contentful paint < 1.0s on local dev (Lighthouse CI in `e2e/`).
- Time-to-stream-first-token < 200ms after `start turn` mutation.
- Terminal byte → render < 16ms.

Add a Lighthouse CI step in CI gating these.

### Skills to Reference During Execution

- @superpowers:executing-plans — task-by-task discipline
- @superpowers:subagent-driven-development — fresh subagent per task
- @superpowers:test-driven-development — red-green-refactor
- @superpowers:systematic-debugging — when something breaks
- @superpowers:verification-before-completion — before checking off any task
- @ecc:tdd-workflow — backup TDD reference
- @vercel:nextjs (if Phase 6 ever pivots to Next.js)

---

## Definition of Done (per phase)

Each phase is "done" when:
1. All listed tasks have a green checkbox.
2. `bun run typecheck && bun run lint && bun run test` is green at repo root.
3. The phase's golden-path E2E (where applicable) passes locally and in CI.
4. The phase's CHANGELOG entry is written.
5. A short ADR (`docs/adr/NNNN-<topic>.md`) exists for any non-obvious tradeoff (e.g., "why SSE not WS for chat", "why drop Puggy", "why TanStack Router not react-router 7").

---

## Sequencing & Parallelism

Phases 1–4 are **strictly sequential** (DB → Domain → Transport → Providers — each depends on the prior).
Phases 5 and 6 can run **in parallel** by two engineers once 1–4 are merged (server vs web shell).
Phases 7–11 can run **in parallel** once 5 + 6 are merged. Phase 12 depends on 6. Phase 13 depends on all.

**Suggested timeline (single engineer, no slack):** 10–12 weeks. **Two engineers:** 6–7 weeks. **Critical path** is Phases 0 → 1 → 2 → 3 → 4 → 5 → 7 (chat UI) → 13 (E2E + distribution).

---

## Out of Scope (explicitly)

- **Puggy template engine** — dropped outright; AI-generated rich content uses MDX or sandboxed iframe (Phase 10).
- **UI identity overlay** (`uiIdentityOverlay.ts`) — internal debug tool; replace with React DevTools workflow.
- **`/api/render/pug` route** — gone with Puggy.
- **Multi-tenant cloud deployment** — Tinkaria is local-first; cloud deployment is a separate plan.
- **LSP / language servers in the in-app terminal** — terminal is a PTY only.
- **Built-in code editor** (Monaco / CodeMirror) — users edit in their IDE.
- **JetStream + KV** — replaced by SQLite + `kvStore` table + DB→NATS publish bridge (Tasks 1.7, 5.4b).
- **Custom WebSocket bridge** for chat — replaced by SSE with replay-from-seq (Task 5.4a). WS only for terminal I/O.

---

## Appendix A — Feature Coverage Traceability

Maps every feature in `docs/feature-inventory.md` to the task(s) that implement it. Use this during execution as a checklist.

| # | v1 Feature | v2 Task(s) |
|---|-----------|-----------|
| 1 | Bun HTTP+WS server | P5.3 |
| 2 | NATS messaging backbone | P3.1 (Core) + P5.4 + P5.4b (DB→NATS bridge) |
| 3 | Event store | P1.2 + P1.5 + P1.7 (snapshot) |
| 4 | Runner agent (turn lifecycle, cancel, title gen) | P2.4 + P4.1 + P4.6 |
| 5 | Runner proxy + runtime registry | P4.1 + P4.4 |
| 6 | Claude provider | P4.2 |
| 7 | CodexAppServerManager (split) | P4.3 |
| 8 | Quick response (codex structured) | P4.5 |
| 9 | Providers tab / health | P5.2 (`providers` router) + P7.15 |
| 10 | Session orchestrator | P2.5 + P5 (server adapter wires the machine) |
| 11 | Delegation coordinator | P2.6 |
| 12 | Session discovery (live disk scan) | P5.6b |
| 13 | Session index | P1.2 (`chats` table) + P5.6b (file watcher) |
| 14 | Read-models / snapshots | P1.7 + P2.2 |
| 15 | Generate merge / fork prompts | P2.7 |
| 16 | App state machine + chat commands | P2.4 + P7 |
| 17 | Chat input (queue, draft, restore, skill) | P7.4 |
| 18 | ChatNavbar + Navigator | P7.5 |
| 19 | Terminal pane + workspace | P8.1 + P8.2 + P8.3 |
| 20 | Right sidebar | P7.8 |
| 21 | Scroll-follow / sticky focus | P7.6 |
| 22 | Sandbox subscription (client) | P7.12 |
| 23 | Chat focus policy | P7.10 |
| 24 | Chat cache (offline) | P12.6 (persisted store layer) + TanStack Query |
| 25 | Mobile sidebar swipe | P7.7 |
| 26 | Message renderer + collapsed tool groups | P7.3 + P2.3 |
| 27 | Ask-user-question | P7.3 |
| 28 | LocalFilePreviewDialog | P7.11 |
| 29 | Present-content | P7.3 |
| 30 | Subagent indicator | P7.3 (UI) + P2.6 (logic) |
| 31 | Rich-content / EmbedRenderer | P10.2 + P10.3 |
| 32 | Puggy | 🗑️ dropped → P10.1 (MDX) |
| 33 | Coordination panels (6) | P9.2 + P9.3 |
| 34 | Runner-side NATS coord client | P5.9a |
| 35 | Coordination MCP server | P5.9 |
| 36 | Repo manager (git) | P5.6a |
| 37 | Workspace agent routes | P5.2 (`workspaces` router) |
| 38 | Workspace config manager | P5.9b |
| 39 | NewWorkspaceModal | P7.14 |
| 40 | LocalDev panel | P7.14 |
| 41 | Chat preferences store | P7.9 |
| 42 | Terminal preferences (scrollback) | P8.4 |
| 43 | Skill composition store | P7.4 |
| 44 | Right sidebar store | P7.8 + P12.6 |
| 45 | Keyboard shortcuts + help overlay | P7.13 |
| 46 | Theme provider | P6.4 |
| 47 | PWA resume | P12.3 |
| 48 | Standalone / mobile detection | P12.5 |
| 49 | Push notifications | P5.7 + P12.2 |
| 50 | Update manager | P12.4 |
| 51 | Extension router + manifest | P11.1 |
| 52 | Agents extension | P11.2 |
| 53 | C3 extension | P11.2 |
| 54 | Code extension | P11.2 |
| 55 | Share + QR | P5.8 |
| 56 | Skill discovery | P5.2 (`skills` router; server scanner implemented as part of router) |
| 57 | CLI runtime | P5.10 |
| 58 | Web context prompt builder | P2.7 (extend prompt builders to include subagent context) |
| 59 | UI identity overlay | 🗑️ Out of scope |
| 60 | Perf benchmark scripts | P13.3a |

**Coverage:** 58/60 implemented · 2/60 explicitly dropped (Puggy, UI identity overlay).

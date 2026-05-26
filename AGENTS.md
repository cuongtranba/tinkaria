# Tinkaria

Web UI for Claude Code and Codex CLIs. Full-stack TypeScript: React 19 client + Bun HTTP/WebSocket server.

## Work From C3

C3 is the architecture source of truth. Do not rediscover project structure or pre-triage C3's scope yourself.

- Send project questions, file paths, audits, impact checks, rules, refs, plans, and implementation work to `/c3`.
- Let C3 classify the operation and provide topology, ownership, rules, refs, recipes, ADRs, and file context.
- Read or edit source only after C3 has returned the relevant context and next steps.
- If C3 is unavailable or check fails, stop and report the blocker instead of bypassing it.
- Keep this file brief; durable architecture and coding rules belong in `.c3/`.

## Verification

- Use Bun, not npm/yarn.
- Use `bunx @typescript/native-preview --noEmit -p tsconfig.json` for typecheck.
- Use focused `bun test ...` for changed behavior, then broader tests as risk demands.
- Run `git diff --check` before finishing.

<important if="you are asked to verify a feature, test it end-to-end, confirm a fix works, smoke-test it, troubleshoot a bug report, or otherwise prove a change works in the real app">

**Prove it in the running app — never substitute "I read the code and it looks right."**

1. **Start the app and confirm components are healthy.** Run `bun run dev`, then `curl -s localhost:3210/health` — `natsDaemon`, `natsConnection`, and `runner` must all report healthy before you trust anything downstream. A `503` means a required component is down; fix that first.
2. **Drive the feature via `browser-harness`.** Use `new_tab(url)` (never `goto`), screenshot after every meaningful action, and read the screenshot back to verify visually. The screenshot is the proof a click or turn landed — do not assume it did.
3. **Capture both sides.** The runtime is multi-process: the Bun server, the embedded NATS daemon, and the runner process each emit separately. For the same action, read the browser console (via `browser-harness`) AND the server/runner stdout; `/health` is the structured server-side signal.
4. **Diagnose from evidence, then fix and re-verify.** State the hypothesis from the logs + screenshots, make the smallest root-cause change, re-run steps 2–3, and record the post-fix screenshot plus a log slice in the story's `validation.md` (or validation notes).

**Dual-signal rule:** the browser/UI signal and the server-side signal (Bun server + runner + NATS, via `/health` or stdout) must agree. **If they disagree, the discrepancy is the bug.** Never declare success from a screenshot alone (it can be stale) or from server logs alone (the turn may never have reached the runner). Use `curl` for API-surface checks; use `browser-harness` when the user's experience is what's being verified.

</important>

## Tooling Roles

Three complementary systems, non-overlapping:

- **Harness** (`scripts/harness`, `docs/HARNESS.md`) — the operational spine. Owns the durable layer (`harness.db`): feature-intake classifications, stories, test matrix, decisions, traces, and backlog.
- **C3** (`/c3`, `.c3/`) — architecture source of truth: component topology, ownership, rules, ADRs, and file context.
- **GitNexus** — code intelligence: blast-radius / impact analysis before editing symbols.

Feature intake uses C3 (component/architecture context) and GitNexus (codebase impact analysis) to classify a change per `docs/FEATURE_INTAKE.md`, then records the classification with `scripts/harness intake`.

<!-- HARNESS:BEGIN -->
## Harness

This repo uses Harness. Before work, read:

- `README.md`
- `docs/HARNESS.md`
- `docs/FEATURE_INTAKE.md`
- `docs/ARCHITECTURE.md`
- `scripts/harness query matrix`

Use the Rust Harness CLI as the main operational tool. Run it through the
stable repo-local entrypoint `scripts/harness`, which uses the prebuilt Rust
binary at `scripts/bin/harness-cli` in installed projects.
<!-- HARNESS:END -->

## Implementation Notes

<important if="you are doing normal-lane or high-risk-lane work — feature implementation, refactor, schema change, or any spec-driven story">

Maintain a running `implementation-notes.html` **inside the story packet folder** — never at the repo root. The story packet (one `.md` from `docs/templates/story.md` for normal; the `docs/templates/high-risk-story/` set for high-risk) is the *contract*; this file is the working narrative that explains *how the implementation got there*.

- **High-risk lane** — alongside `execplan.md` / `overview.md` / `design.md` / `validation.md` in the story folder.
- **Normal lane** — next to the single story `.md`; if the story is currently a bare file, create its folder and move the `.md` inside.
- **Tiny lane** — none by definition; if you want one, the work isn't tiny — re-run the intake gate and re-lane.

Self-contained HTML (inline `<style>`, no build, no dependencies) so it opens directly in a browser. Update it **as you go**, not just at the end, capturing:

- **Design decisions** — choices made where the spec was ambiguous, and why.
- **Deviations** — where you intentionally departed from the plan, and why.
- **Tradeoffs** — alternatives considered and why you picked what you did.
- **Open questions** — anything you'd want the user to confirm, each with your recommendation.

Reference its full path in your final response. If anything in it no longer reflects reality, fix that section before continuing — it is the paper trail.

</important>

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **tinkaria** (8720 symbols, 16561 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/tinkaria/context` | Codebase overview, check index freshness |
| `gitnexus://repo/tinkaria/clusters` | All functional areas |
| `gitnexus://repo/tinkaria/processes` | All execution flows |
| `gitnexus://repo/tinkaria/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

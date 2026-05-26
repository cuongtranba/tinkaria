# Harness Backlog

Use this file when an agent discovers a missing harness capability but should
not change the operating model immediately.

## Template

```md
## Missing Harness Capability

### Title

Short name.

### Discovered While

Task or story that exposed the gap.

### Current Pain

What was hard, repeated, ambiguous, or unsafe?

### Suggested Improvement

What should be added or changed?

### Risk

Tiny, normal, or high-risk.

### Status

proposed | accepted | implemented | rejected
```

## Items

## Missing Harness Capability

### Title

c3x 8.0.7 migrate-legacy drops all entity bodies (C3 DB migration blocked)

### Discovered While

Planning `mobile-composer-menu` — the project's "Work From C3" rule routed
planning through `/c3`, which requires a built `.c3/c3.db`. None existed
(legacy v6 markdown only), so a v6→v7 migration was attempted.

### Current Pain

`c3x migrate-legacy` (v8.0.7) imports frontmatter + relationships + code-map
but **silently drops every entity body** — the `nodes` table stays empty, there
is no `body` column, and `c3x export` round-trips frontmatter-only files
(e.g. `rule-react-no-effects` 80 lines → 6). No `warning:`/`error:` line is
emitted, so the documented "warnings are errors" gate passes while authored
prose for all rules/ADRs/refs/recipes is absent from the DB. Phase B (v7→v8)
then reports `0 to migrate`. Leaving the half-migrated DB is a footgun: a later
`c3x export`/sync would overwrite the intact markdown with empty bodies.

### Suggested Improvement

Pin/obtain a c3x build whose `migrate-legacy` preserves bodies (populate
`nodes` from the markdown body), or add a body-preserving import path; until
then keep C3 file-based and treat `.c3/` markdown as the source of truth. The
broken `c3.db` was deleted; additive repairs (40 `## Dependencies` stubs, 18
stale code-map glob fixes) remain on disk and are independently valid.

### Risk

normal

### Status

proposed


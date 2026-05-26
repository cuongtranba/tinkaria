---
id: adr-20260414-render-c3-markdown-extension
c3-seal: dd51d5ff1c1b35895425e450af40d001fd52a87ca4f3295007b72a2c8c2e6f38
title: render-c3-markdown-extension
type: adr
goal: Render full C3 entity documents in the project Architecture extension as proper markdown instead of JSON/preformatted raw text.
status: implemented
date: "2026-04-14"
---

## Goal

Render full C3 entity documents in the project Architecture extension as proper markdown instead of JSON/preformatted raw text.

## Work Breakdown

- Change the C3 read route to call `c3x read <id> --full` so entity body content is not truncated.
- Parse JSON read output on the server and return structured data to the client.
- Convert C3 entity records into markdown documents with heading, metadata table, uses list, goal quote, and original body sections.
- Render selected entity detail through the existing `react-markdown` + GFM markdown pipeline instead of `<pre>` JSON.
- Add focused regressions for markdown detail rendering and full read payloads.

## Risks

- C3 read output is CLI-owned; client keeps string fallback behavior for non-JSON output.
- Markdown tables need escaping for metadata values containing pipes/newlines.

## Verification

- RED: `bun test src/client/extensions/extensionsIdentity.test.tsx` failed on missing `normalizeC3DetailDocument` export before implementation.
- GREEN: `bun test src/client/app/ProjectPage.test.tsx src/client/extensions/extensionsIdentity.test.tsx src/server/extensions/c3/server.test.ts` passed 21 tests.
- Typecheck: `bunx @typescript/native-preview --noEmit -p tsconfig.json` passed.
- C3: `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check` returned zero issues.
- Browser: dev server on `http://127.0.0.1:5184/`, project route `/project/713f48e1-0a30-41a7-8655-dd79b032c0d8`, selected `c3-120`, verified rendered markdown `h1=extensions`, h2s include `Uses`, `Goal`, `Dependencies`, `Related Refs`, tables rendered, no raw JSON body text, and no console errors.

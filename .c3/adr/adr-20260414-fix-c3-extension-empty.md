---
id: adr-20260414-fix-c3-extension-empty
c3-seal: 032c9467cbadd3589f304a1e31d366abef014c63b72399f96e9dd1e64c35fbbc
title: fix-c3-extension-empty
type: adr
goal: Fix the C3 extension/project surface so a Kanna/Tinkaria project with valid C3 data displays meaningful architecture content instead of an empty view.
status: implemented
date: "2026-04-14"
---

## Goal

Fix the C3 extension/project surface so a Kanna/Tinkaria project with valid C3 data displays meaningful architecture content instead of an empty view.

## Work Breakdown

- Force C3 list route to request `c3x list --compact --json` so server returns parsed entity arrays instead of TOON text.
- Normalize C3 JSON entities on the client, mapping `title` to renderable `name` and preserving valid nested children.
- Add focused regression tests for parsed server data and client entity normalization.
- Preserve extension UI identity coverage while working with existing extension identity changes.

## Risks

- Existing running dev server on 5174 may still serve old code until restarted; verified fixed build on alternate dev ports 5184/5185.
- C3 CLI output remains external; route still keeps a fallback for unexpected non-JSON output.

## Verification

- RED: `bun test src/server/extensions/c3/server.test.ts src/client/extensions/extensionsIdentity.test.tsx` initially failed because `getC3ExtensionUiIdentityDescriptors` was missing; server list test was too weak and allowed raw TOON.
- GREEN: `bun test src/server/extensions/c3/server.test.ts src/client/extensions/extensionsIdentity.test.tsx` passed 16 tests.
- Typecheck: `bunx @typescript/native-preview --noEmit -p tsconfig.json` passed.
- C3: `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check` returned zero issues.
- Browser: dev server on `http://127.0.0.1:5184/`, project route `/project/713f48e1-0a30-41a7-8655-dd79b032c0d8` displayed Architecture tab with 93 entities, C3 rows, component detail, dependency graph, and no console errors.

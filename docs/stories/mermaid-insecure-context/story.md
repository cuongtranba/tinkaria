# mermaid-insecure-context — Mermaid renders over HTTP-on-IP (insecure context)

## Status

implemented

## Lane

normal

## Product Contract

Mermaid diagrams must render when the app is accessed from an insecure context
(e.g. `http://<LAN/Tailscale-IP>:3210`), not only from `localhost`/HTTPS.

## Acceptance Criteria

- On an insecure-context origin (`window.isSecureContext === false`,
  `crypto.randomUUID` undefined), mermaid embeds render to SVG instead of
  showing "Diagram render error".
- localhost/HTTPS rendering is unchanged.

## Design Notes

- Root cause: `MermaidDiagram` built its element id with
  `crypto.randomUUID().slice(0,8)`. `crypto.randomUUID()` is only defined in
  secure contexts; over HTTP-on-IP it is `undefined`, so the call threw and was
  caught as "Diagram render error".
- Fix: use the existing `generateUUID()` helper (`src/client/lib/utils.ts`),
  which falls back to a Math.random-based UUID when `crypto.randomUUID` is
  unavailable.
- UI surface: `src/client/components/rich-content/EmbedRenderer.tsx`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | rich-content suite green (85); typecheck 0. |
| E2E | browser-harness against `http://100.125.230.68:3210` (isSecureContext=false, randomUUID undefined): mermaid renders to SVG, no "Diagram render error" (reproduced the failure pre-fix). |
| Platform | Insecure-context / LAN-IP access. |

## Known related finding (not fixed here)

`src/client/app/useChatCommands.ts:274` uses raw `crypto.randomUUID()` for the
optimistic chat id — same insecure-context crash, would break chat creation over
HTTP-on-IP. Recommend switching it to `generateUUID()` too.

## Evidence

browser-harness /tmp/ipmermaid-err.png (pre-fix error) and
/tmp/ipmermaid-fixed.png (post-fix render) on the IP origin.

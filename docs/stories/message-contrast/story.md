# message-contrast — Distinguish user messages from agent responses (both themes)

## Status
implemented

## Lane
normal

## Product Contract
User messages must be clearly distinguishable from agent responses in both dark
and light themes.

## Design Notes
- Root cause: user bubble used `bg-muted`, only ~3–5% lightness off the page
  background in both themes → nearly invisible; and `prose-invert` was applied
  unconditionally, washing out text in light mode.
- Fix (`UserMessage.tsx`): bubble uses a brand `logo`-tinted background + border
  (`bg-logo/[0.10] dark:bg-logo/[0.16]`, `border-logo/25 dark:border-logo/30`),
  `text-foreground`, `shadow-sm`, and `dark:prose-invert` (light mode keeps dark
  prose text). Agent responses stay neutral full-width markdown → clear split.

## Validation
| Layer | Expected proof |
| --- | --- |
| Unit | typecheck 0; existing message tests green |
| E2E | browser-harness dark + light: user bubble warm/rose tint, readable text (rgb(9,9,11) light / inverted dark), clearly distinct from agent text |

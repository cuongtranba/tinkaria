# code-block-whitespace — Preserve whitespace for language-less code fences (ASCII art)

## Status

implemented

## Product Contract

A fenced code block written without a language (```` ``` ````) — commonly used
for ASCII-art diagrams, trees, and tables — must render as preformatted text
(monospace, preserved whitespace, horizontal scroll when wide) so its alignment
survives. It must NOT be styled like inline code (wrapping / collapsed
whitespace), which destroys ASCII art and makes it unreadable.

## Lane

normal

## Acceptance Criteria

- A multi-line code fence with no language renders block-style: `whitespace-pre`,
  monospace, inside the existing `overflow-x-auto` pre wrapper (horizontal scroll
  on narrow/mobile), with alignment preserved.
- Inline code (single-line, no language) is unchanged (pill styling).
- Code fences with a language continue to render highlighted, unchanged.
- Fix applies to both the transcript and the file-preview markdown (shared
  `markdownComponents.code`).

## Design Notes

- Root cause: `markdownComponents.code` used `isInline = !className`. react-markdown
  gives a *language-less* block fence's `<code>` no className, so it was
  misclassified as inline → `whitespace-normal [overflow-wrap:anywhere]` → ASCII
  wrapped and collapsed.
- Fix: `isInline = !className && !rawText.includes("\n")` (multi-line ⇒ block).
  Block branch renders `whitespace-pre`; when there's no language/preset it
  renders the escaped text directly (no syntax highlighting) instead of calling
  `highlight()` with an undefined preset.
- UI surface: `src/client/components/messages/shared.tsx` (`markdownComponents.code`).

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | messages/shared suites green; typecheck 0. |
| E2E | browser-harness on the Symphony-check transcript: the ASCII board/flow diagrams render aligned (monospace, preserved) with horizontal scroll, not wrapped. |
| Platform | Verify at mobile width (≤767px) — ASCII scrolls horizontally instead of wrapping. |

## Evidence

Captured in session after fix (browser-harness screenshots).

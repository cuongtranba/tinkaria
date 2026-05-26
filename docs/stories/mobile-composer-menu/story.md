# mobile-composer-menu — Collapse composer preference controls into a model-indicator menu on mobile

## Status

planned

## Lane

normal

## Product Contract

On mobile viewports (≤767px, via `useIsMobile()`), the composer preference bar
(`ChatPreferenceControls`) — today a horizontally-scrolling strip of chips
(Provider, Model, Skills, Reasoning, Context/Fast Mode, Plan Mode) — collapses
into a **single trigger: the model indicator**. Tapping it opens a drill-in
(master-detail) menu inside one Radix Popover. Desktop (≥768px) keeps the
current inline chip row, unchanged in both appearance and behavior.

## Relevant Product Docs

- `.c3/c3-1-client/c3-112-chat-input.md` (component ownership: chat-input)
- `.c3/rules/rule-react-no-effects.md` (governing rule)
- `.c3/rules/rule-ui-component-usage.md`, `.c3/rules/rule-rule-strict-typescript.md`

## Acceptance Criteria

- On a ≤767px viewport, `ChatPreferenceControls` renders a single trigger
  showing the model icon + model label (e.g. `sonnet[1m]`) + a chevron; the
  inline chip row is not rendered.
- The trigger reflects active non-default modes: Plan Mode shows the `ListTodo`
  icon and blue color; Codex Fast Mode shows its active styling. Defaults
  (Full Access, Standard) show neutral styling.
- Tapping the trigger opens a single Radix Popover (level-1) listing category
  rows — Provider (when shown & unlocked), Model, Reasoning, Context (Claude,
  >1 option) / Fast Mode (Codex), Mode (when plan mode supported) — each with a
  `›` affordance and its current value as subtext.
- **Skills** appears as a level-1 row with an on/off state and **no** `›`;
  tapping it toggles the skill ribbon and closes the menu.
- Tapping a category row drills in (level-2): the popover content swaps to that
  category's options with a `‹` back arrow; tapping back returns to level-1.
- Selecting an option in level-2 applies the change and **closes the whole
  menu** (mirrors today's per-chip behavior).
- Double-tap-to-cycle-model is **not** active on the mobile trigger (single tap
  opens the menu). It remains on the desktop model chip.
- Desktop (≥768px) rendering and behavior are byte-for-byte unchanged.
- No `useEffect`/`useLayoutEffect` is added (rule-react-no-effects): level
  navigation is local `useState`; trigger label/coloring is render-time
  derivation; menu actions are event handlers; `useIsMobile()` is the existing
  `useSyncExternalStore` adapter.
- The shared exports `InputPopover`, `PopoverMenuItem`, `PROVIDER_ICONS` keep
  their current signatures (consumed by ForkSessionDialog, MergeSessionDialog,
  sidebar/ChatRow).
- UI-identity descriptors are preserved/reused so the UI-identity overlay and
  any e2e selectors keep resolving; drill-in rows get sensible identities.

## Design Notes

- Commands: none (no server/domain change).
- Queries: none.
- API: none.
- Tables: none.
- Domain rules: rule-react-no-effects (no Effects), rule-rule-strict-typescript,
  rule-ui-component-usage.
- UI surfaces: `src/client/components/chat-ui/ChatPreferenceControls.tsx`
  (branch on `useIsMobile()`; desktop path = today's row; mobile path = trigger
  + drill-in menu). Single render consumer: `ComposerPreferenceControls` in
  `ChatInput.tsx` (no prop changes — hook read internally). Local state:
  `view` = `{ level: "root" } | { level: "category"; key: CategoryKey }`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `ChatPreferenceControls.test.tsx` extended: with `useIsMobile()=true`, renders single trigger (not the chip row); level-1 lists expected category rows incl. Skills toggle; drilling into a category shows its options + back arrow; selecting an option fires the right callback and closes; trigger reflects Plan Mode styling. With `useIsMobile()=false`, desktop row unchanged (snapshot/structure). |
| Integration | n/a (no cross-module/server interaction). |
| E2E | browser-harness @≤767px (e.g. 390px): open menu via model trigger; drill into Reasoning → pick a level; menu closes; reopen → Skills toggle flips ribbon + closes; Plan Mode selection recolors trigger. Screenshot proof per the dual-signal rule. |
| Platform | Desktop ≥768px: chip row renders and behaves as before; mobile: collapsed menu. Verified at both widths. |

## Harness Delta

- Intake recorded (`scripts/harness intake`), story added (`scripts/harness
  story add`), TEST_MATRIX rows added.
- Discovered friction logged separately: C3 DB migration is blocked by a c3x
  8.0.7 `migrate-legacy` bug that drops all entity bodies — see
  `docs/HARNESS_BACKLOG.md`.

## Evidence

Add commands, reports, screenshots after validation exists.

---
id: rule-ui-component-usage
c3-seal: fad3b222f3502fedcf94223b4c9ed2c96c658a1b52f3780653cb0448789d949d
title: ui-component-usage
type: rule
goal: Ensure all client feature components use the shared UI primitive library (`src/client/components/ui/`) instead of raw HTML form elements, maintaining visual consistency and a single source of truth for styling.
---

## Goal

Ensure all client feature components use the shared UI primitive library (`src/client/components/ui/`) instead of raw HTML form elements, maintaining visual consistency and a single source of truth for styling.

## Rule

Feature components (anything under `src/client/components/` or `src/client/app/` that is NOT inside `src/client/components/ui/`) MUST use the shared UI primitives for form elements:

| HTML Element | Required Primitive | Import Path |
| --- | --- | --- |
| <input> | <Input> | ../ui/input |
| <textarea> | <Textarea> | ../ui/textarea |
| <button> (actions) | <Button> | ../ui/button |

### Size Variants

Both `Input` and `Textarea` support `size="sm"` for dense/compact UI contexts (panels, inline forms):

- **default**: `rounded-lg px-3 py-2 bg-background` — standard forms, modals, settings
- **sm**: `rounded-md px-2 py-1 bg-transparent` — coordination panels, inline edits, dense toolbars

### Exceptions (allowed raw elements)

- `<select>` in dense forms where Radix Select would be too heavy (e.g., 3-option priority picker)
- `<button>` used as filter pills with custom visual states (e.g., rounded-full toggle chips)
- `<input type="checkbox">` / `<input type="radio">` until Radix primitives are adopted
- Elements inside `src/client/components/ui/` itself (they ARE the primitives)

## Golden Example

```tsx
// GOOD: Dense panel form using sm variant
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Button } from "../ui/button"

<PanelAddForm show={showAddForm}>
  <Input size="sm" placeholder="Task description..." value={value} onChange={onChange} />
  <Textarea size="sm" placeholder="Details..." rows={3} value={value} onChange={onChange} />
  <Button variant="default" size="sm" onClick={onSubmit}>Add</Button>
</PanelAddForm>
```

## Not This

```tsx
// BAD: Raw input with hand-rolled classes
<input
  className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
  placeholder="Task description..."
/>

// BAD: Raw button for actions (use Button component)
<button className="text-xs text-primary hover:underline" onClick={onClaim}>claim</button>
```

---
id: rule-ui-identity-composition
c3-seal: 95716b49e04f3389cc0f5ead9bedf62b0811cc8d4f1fd50605e78009da6105dd
title: ui-identity-composition
type: rule
goal: Ensure every screen composition surface and Alt+Shift grab-target element exposes a stable semantic ui id plus explicit C3 ownership metadata.
---

## Goal

Ensure every screen composition surface and Alt+Shift grab-target element exposes a stable semantic ui id plus explicit C3 ownership metadata.

## Rule

Client screen roots and any element intentionally grabbable by the Alt+Shift overlay MUST be defined as C3-owned ui identity descriptors, rendered via `getUiIdentityAttributeProps(...)`, and regression-tested for both `data-ui-id` and matching `data-ui-c3` ownership metadata.

## Golden Example

```typescript
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../lib/uiIdentityOverlay"

const CHAT_PAGE_UI_DESCRIPTORS = {
  page: createC3UiIdentityDescriptor({
    id: "chat.page",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  transcript: createC3UiIdentityDescriptor({
    id: "transcript.message-list",
    c3ComponentId: "c3-111",
    c3ComponentLabel: "messages",
  }),
} as const

const CHAT_PAGE_UI_IDENTITIES = getUiIdentityIdMap(CHAT_PAGE_UI_DESCRIPTORS)

export function getChatPageUiIdentityDescriptors() {
  return CHAT_PAGE_UI_DESCRIPTORS
}

<div {...getUiIdentityAttributeProps(CHAT_PAGE_UI_DESCRIPTORS.page)} />

expect(getUiIdentityAttributeProps(getChatPageUiIdentityDescriptors().page)).toEqual({
  "data-ui-id": "chat.page",
  "data-ui-c3": "c3-110",
  "data-ui-c3-label": "chat",
})
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| const ids = { page: "chat.page" } for a screen shell or Alt+Shift grab target | Define a descriptor with createC3UiIdentityDescriptor(...) and derive the id map from it | Plain strings drop the ownership metadata Alt+Shift needs |
| Rendering data-ui-id manually on a screen root | Spread getUiIdentityAttributeProps(descriptor) | Manual attrs drift from the shared copy/overlay helpers |
| Tests assert only data-ui-id on a grabbable screen element | Assert the full descriptor props including data-ui-c3 and data-ui-c3-label | Passing id-only tests still allows broken C3 lookup in the overlay |

## Scope

Applies to browser client screen roots, overlays, popovers, dialogs, and other intentionally grabbable elements that Alt+Shift should expose as part of screen composition. Passive decorative markup does not need a ui identity.

## Override

If an element must stay outside Alt+Shift discovery, omit the ui identity entirely. Do not use a string-only ui id for a grabbable surface.

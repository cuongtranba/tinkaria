---
id: ref-quirky-copy
c3-seal: cf965aae069f1c97ee35da6b70b22f21ee65bbe578df806391015a418a4f2a04
title: quirky-copy
type: ref
goal: Keep Tinkaria's playful short-form product copy recognizable across low-information chat states without turning tiny text helpers into their own runtime component boundary.
---

## Goal

Keep Tinkaria's playful short-form product copy recognizable across low-information chat states without turning tiny text helpers into their own runtime component boundary.

## Choice

Use one shared quirky-copy reference for deterministic, curated phrase pools that are consumed by the chat empty state and composer surfaces. Keep the phrase assembly helper in ordinary client code, and cite this ref from the owning UI components that display the copy.

## Why

The behavior is too small for a C3 component because it has no independent UI surface, protocol, persistence, or service boundary. It still deserves architecture memory because the same product-voice pattern appears in more than one chat surface, and future changes should preserve deterministic selection, curated language, and low-distraction motion.

## How

- Keep copy pools curated, short, and product-facing; do not generate random words at render time.
- Select phrases deterministically from stable context such as `chatId`, so route changes and rerenders do not reshuffle visible copy.
- Put phrase construction in a shared helper when more than one surface uses it.
- Let consuming components own presentation and animation details: chat empty state owns blank-chat display, chat-input owns composer placeholder behavior.
- Test the selection contract with Bun tests: same seed returns same phrase, awaiting/rotating states move through the same curated pool, and visible components render the expected hook/class.

## Not This

- Do not create a standalone C3 component for a helper that has no independent runtime contract.
- Do not use nondeterministic `Math.random()` for user-visible placeholder or empty-state copy.
- Do not duplicate phrase pools inside each component.
- Do not let whimsical copy replace actionable error, safety, or destructive-action wording.

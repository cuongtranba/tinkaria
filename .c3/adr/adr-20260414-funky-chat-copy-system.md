---
id: adr-20260414-funky-chat-copy-system
c3-seal: 98c9438fa2730c752ca1734be93cf57a2d3469401d086b431d9e53ce550bea5d
title: funky-chat-copy-system
type: adr
goal: Make chat empty-state and composer placeholder copy feel playful and brand-adjacent by introducing a reusable word-composition helper plus a curated rotating copy pool, with calm low-attention animation behavior.
status: proposed
date: "2026-04-14"
---

## Goal

Make chat empty-state and composer placeholder copy feel playful and brand-adjacent by introducing a reusable word-composition helper plus a curated rotating copy pool, with calm low-attention animation behavior.

## Affected

- c3-111 messages
- c3-112 chat-input
- c3-110 chat

## Why

Current strings are static and plain. The product wants quirky, lightly made-up wording that can scale without hand-authoring every future variation.

## Plan

1. Add a reusable copy-composition utility for quirky word building and phrase assembly.
2. Replace the static empty transcript and composer placeholder copy with curated rotating pools.
3. Keep motion gentle and non-invasive; verify with focused tests, typecheck, and browser smoke.

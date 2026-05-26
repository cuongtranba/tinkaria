---
id: adr-20260415-fix-session-stop-button-hangs
c3-seal: 227abf5e35d9ec893c431351ebb4d20d597fa25add272506abe9e9e17549331b
title: fix-session-stop-button-hangs
type: adr
goal: Reproduce and fix the session where a running chat keeps running forever and the stop button does not cancel it.
status: implemented
date: "2026-04-15"
---

# Fix Session Stop Button Hangs

## Goal

Reproduce and fix the session where a running chat keeps running forever and the stop button does not cancel it.

## Context

User reported URL: https://claude.tini.works/chat/da182fb5-319d-4ed9-bbe6-c958c58f9cd3. The bug likely crosses client stop UI, WebSocket command plumbing, server orchestration, runner proxy cancellation, or transcript runtime state.

## Plan

RED: reproduce stop action failure with browser smoke or focused tests around cancel command behavior.
GREEN: patch smallest root cause so stop reliably cancels active work and clears running UI state.
VERIFY: focused Bun tests, native TypeScript check, C3 check, git diff check, browser smoke with agent-browser/axi where feasible.

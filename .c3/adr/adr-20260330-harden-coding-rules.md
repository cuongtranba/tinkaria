---
id: adr-20260330-harden-coding-rules
c3-seal: bd15485c312d76450c4e7e928dc1ecd5678bf4194dd217a987b6fab232414977
title: harden-coding-rules
type: adr
goal: Codify existing coding patterns as enforceable C3 rules to harden code quality, error handling, and testing conventions.
status: implemented
date: "2026-03-30"
---

## Goal

Codify existing coding patterns as enforceable C3 rules to harden code quality, error handling, and testing conventions.

## Decision

Created 5 coding rules extracted from existing golden patterns in the codebase:

| Rule | Scope | Key Enforcement |
| --- | --- | --- |
| rule-error-extraction | All catch blocks | error instanceof Error ? error.message : String(error) |
| rule-bun-test-conventions | All test files | Bun test, describe/test, afterEach cleanup, typed helpers |
| rule-type-guards | Type validation | is* predicates, normalize* functions, require*/get* duality |
| rule-prefixed-logging | All logging | LOG_PREFIX constant, severity-appropriate console methods |
| rule-graceful-fallbacks | External inputs | Normalize with fallback, handle ENOENT/SyntaxError, never crash on bad data |

## Status

Implemented. All rules wired to relevant components.

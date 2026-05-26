---
id: adr-20260417-fix-notification-toggle-and-sw-click
c3-seal: 5cfb7fe8d27849a1ab468bca3de0c416fadad17862375ac85ee08e131713da99
title: fix-notification-toggle-and-sw-click
type: adr
goal: 'Fix two notification bugs: (1) NotificationToggle silently swallows errors — click does nothing visible. (2) SW notificationclick URL mismatch — click does nothing.'
status: proposed
date: "2026-04-17"
---

## Goal

Fix two notification bugs: (1) NotificationToggle silently swallows errors — click does nothing visible. (2) SW notificationclick URL mismatch — click does nothing.

## Context

NotificationToggle ignores error/loading from usePushNotifications hook. SW compares full client.url with relative payload url.

## Decision

Surface error state in NotificationToggle. Resolve relative URL to absolute in sw.js before client matching.

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| src/client/components/NotificationToggle.tsx | Show error tooltip/text when subscribe fails | Manual + test |
| public/sw.js | Use URL constructor to resolve relative path before comparing | Manual + test |
| src/client/hooks/usePushNotifications.ts | No changes needed — already tracks error | N/A |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| None | No C3 underlay changes | N/A |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| NotificationToggle render | Shows error feedback on failed subscribe | Unit test |
| sw.js notificationclick | Resolves URL before matching | Unit test |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Remove notification feature entirely | Feature is valuable, bugs are fixable |
| Only fix toggle | SW click bug independently broken |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| SW cache stale after update | skipWaiting already in sw.js | Manual check |

## Verification

| Check | Result |
| --- | --- |
| bun test push-notifications | Pass |
| Toggle click shows error when VAPID missing | Visual + test |
| Notification click navigates correctly | SW test |

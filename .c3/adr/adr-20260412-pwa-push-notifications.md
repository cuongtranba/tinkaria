---
id: adr-20260412-pwa-push-notifications
c3-seal: 09f2e0a80837c28dc1427be20613194e3104f2d3123d35d5cda2f97e626ffe66
title: pwa-push-notifications
type: adr
goal: Add Web Push Notifications to Tinkaria so users receive native OS notifications when important events occur — even when the browser tab is backgrounded or the PWA is closed. This extends the existing `ref-pwa` service worker (currently no-op) with push event handling, and adds server-side VAPID-based push delivery.
status: proposed
date: "2026-04-12"
---

## Goal

Add Web Push Notifications to Tinkaria so users receive native OS notifications when important events occur — even when the browser tab is backgrounded or the PWA is closed. This extends the existing `ref-pwa` service worker (currently no-op) with push event handling, and adds server-side VAPID-based push delivery.

### Motivation

Tinkaria manages long-running agent sessions. Users often switch away from the tab while waiting for results. Without push notifications, they must poll the UI. Push notifications close this feedback gap for:

- **Agent task completion** — session finished or errored
- **Tool approval needed** — `AskUserQuestion` awaiting user input
- **Background agent results** — forked/background work completed

### Decision

**Web Push API + VAPID + `web-push` npm package.** No third-party push services (OneSignal, Firebase). Reasons:

1. Self-hosted — aligns with Tinkaria's local-first architecture
2. VAPID is the standard — works across Chrome, Firefox, Safari, Edge
3. `web-push` is a lightweight Node/Bun-compatible library (~50KB)
4. No vendor dependency or external account required

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  React UI   │────▶│  Tinkaria Server │────▶│ Push Service │
│ (subscribe) │     │  (web-push lib)  │     │ (FCM/APNs)  │
└─────────────┘     └──────────────────┘     └──────┬──────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │ Service Wkr  │
                                              │ (push event) │
                                              └─────────────┘
```

### Components Affected

| Component | Change |
| --- | --- |
| c3-101 app-shell | SW registration already exists; extend public/sw.js with push + notificationclick handlers |
| c3-102 stores | New Zustand store for push subscription state + notification preferences |
| c3-205 nats-transport | Publish push-worthy events on NATS subjects; server push sender subscribes |
| c3-214 read-models | Track push subscriptions per client (endpoint + keys + preferences) |

### New Server Module

`src/server/push-notifications.ts`:

- VAPID key management (env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- Subscription CRUD (store in event-sourced model or simple JSON)
- Push sender: listens to NATS events, sends via `web-push`
- HTTP endpoints: `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`, `GET /api/push/vapid-key`

### New Client Module

`src/client/hooks/usePushNotifications.ts`:

- Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
Feature detection (`serviceWorker` + `PushManager` + `Notification`)
- Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
Permission request (user-initiated, never on page load)
- Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
Subscription lifecycle (subscribe/unsubscribe/check)
- Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
Send subscription to server
`src/client/components/NotificationSettings.tsx`:
- Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
Toggle for enabling/disabling push
- Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
Notification type preferences (which events to notify)
- Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator
Visual permission state indicator

### Service Worker Changes (public/sw.js)

```js
// Existing
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// New
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Tinkaria", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
      tag: data.tag, // dedup same-type notifications
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      // Focus existing tab if open, else open new
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
```

### Platform Constraints

- **iOS Safari**: Push only works after "Add to Home Screen" (iOS 16.4+). Tinkaria already supports standalone mode via `ref-pwa`.
- **Permission UX**: Must request after user gesture (button click), never on page load.
- **HTTPS required**: Already satisfied (Cloudflare tunnel).

### Implementation Plan

1. Generate VAPID keys, add to env config
2. Add `web-push` dependency
3. Extend `sw.js` with push + notificationclick handlers
4. Create server push module (subscription store + sender)
5. Create client hook + settings UI
6. Wire NATS events to push sender (session complete, AskUserQuestion, errors)
7. Test across Chrome, Firefox, Safari

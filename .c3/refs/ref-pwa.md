---
id: ref-pwa
c3-seal: b4d4247f22266621c1f81d561426e0cc54ef5e49d37009b50526c485f7f1b840
title: pwa
type: ref
goal: Enable Tinkaria to be installed as a standalone app on mobile and desktop via Progressive Web App (PWA) — homescreen icon, standalone display mode, and service worker lifecycle for future caching and push notifications.
---

## Goal

Enable Tinkaria to be installed as a standalone app on mobile and desktop via Progressive Web App (PWA) — homescreen icon, standalone display mode, and service worker lifecycle for future caching and push notifications.

## Choice

Minimal hand-rolled PWA: static `manifest.webmanifest` + lightweight `sw.js` + manual registration in `main.tsx`. No build-time PWA plugin (vite-plugin-pwa / workbox).

## Why

Tinkaria is a WebSocket-heavy real-time app — aggressive caching would fight the live connection model. A minimal service worker provides the installability gate (Chrome/Safari require a SW for Add to Home Screen) without introducing stale-cache bugs. The SW can be extended incrementally for push notifications and shell caching when needed.

## How

### Manifest — public/manifest.webmanifest

```json
{
  "name": "Tinkaria",
  "short_name": "Tinkaria",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1f2023",
  "theme_color": "#1f2023",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker — public/sw.js

No-op fetch handler. `skipWaiting()` + `clients.claim()` for instant activation.

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
```

### Registration — src/main.tsx

```ts
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
  })
}
```

### HTML Meta — index.html

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#1f2023" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Tinkaria" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

### Extension Points

- **Push notifications**: Add `push` event listener to `sw.js`, server sends via Web Push API (VAPID). Natural triggers: agent completed, tool approval needed, session error.
- **App shell caching**: Cache `index.html` + JS/CSS bundles in `install` event for offline shell loading.
- **Background sync**: Queue offline actions in IndexedDB, replay on reconnect.

### Constraints

- Do NOT cache API/WebSocket responses — real-time data must always be live
- Keep `sw.js` in `public/` (static, not build-processed) so updates deploy independently of the app bundle
- `theme_color` in manifest and `<meta>` must stay in sync with the dark theme CSS variable

---
id: adr-20260406-kit-preview-proxy
c3-seal: 9793d0d9dea4e688b90419fc6dc2107cf3dd094185e383864765825e74578ea9
title: kit-preview-proxy
type: adr
goal: Expose local dev server ports (e.g. localhost:5173) to Tinkaria viewers — including mobile PWA clients on LAN or remote — through kit-advertised preview targets, NATS HTTP relay, and pluggable tunnel strategy.
status: provisioned
date: "2026-04-06"
---

## Goal

Expose local dev server ports (e.g. localhost:5173) to Tinkaria viewers — including mobile PWA clients on LAN or remote — through kit-advertised preview targets, NATS HTTP relay, and pluggable tunnel strategy.

## Context

Kit is the long-running execution daemon that sits on the same machine as the user's dev server. When an agent runs `bun run dev` or similar, a preview of the running app should be visible to whoever is viewing the Tinkaria UI — including mobile PWA users on a different device.

### Constraints

- **Path-based reverse proxy is not acceptable.** Dev servers serve from root `/`. Prefixing paths (`/preview/kit/5173/`) breaks hardcoded absolute paths, HMR WebSocket endpoints, CSS `url()`, and client-side routing.
- **Subdomain routing fails for mobile.** Mobile PWA connects via LAN IP (`192.168.1.100:3210`) or tunnel URL. You cannot subdomain an IP address, and `*.localhost` resolves to the phone itself.
- **WebSocket passthrough is required.** Vite HMR, Next.js fast-refresh, and similar tools use WebSocket on the dev server port.

## Decision

### v1: NATS HTTP relay + pluggable tunnel

Two layers:

**Layer 1 — NATS HTTP relay (LAN access)**

Hub opens a `Bun.serve` on an ephemeral port (`0.0.0.0:0`) per preview target. Each incoming HTTP/WS request is serialized, sent to the kit over NATS request/reply, kit fetches from the local dev server, and returns the response. The iframe loads from `http://<hub-ip>:<relay-port>/` — dev server sees root `/`.

**Layer 2 — Pluggable tunnel (remote/mobile access)**

For viewers who can't reach the hub's LAN, the hub creates a tunnel for the relay port. The tunnel service is pluggable — cloudflared (already in codebase via `share.ts`), Pinggy (zero-install SSH), bore (self-hostable Rust), or any service that maps `localPort → publicUrl`. The client receives the tunnel URL via NATS snapshot.

### v2 (future): Service Worker proxy

Eliminate the extra port entirely. The preview iframe loads a bootstrap page from the hub (same-origin), which registers a Service Worker. The SW intercepts all fetch requests and routes them through `postMessage` → parent window → existing NATS WebSocket → hub → kit → dev server. No extra port, no tunnel. This is the StackBlitz WebContainers approach. Requires HTTPS (fine when tunneled, problematic on plain HTTP LAN). Deferred to v2.

## Transport Design (v1)

### Kit registration

Kit advertises preview targets in its `KitProfile`:

```typescript
interface KitPreviewTarget {
  port: number       // dev server port (e.g. 5173)
  label: string      // human-readable name (e.g. "vite-dev")
}

// Added to CodexKitRegistration:
previewTargets?: KitPreviewTarget[]
```

### NATS HTTP relay protocol

New NATS subjects for preview relay:

- `kanna.kit.<kitId>.preview.request` — hub sends serialized HTTP request
- `kanna.kit.<kitId>.preview.response` — kit returns serialized HTTP response
Request envelope:

```typescript
interface PreviewRequest {
  id: string
  port: number
  method: string
  path: string          // always starts with "/" — dev server sees root
  headers: Record<string, string>
  body?: string | null
}
```

Response envelope:

```typescript
interface PreviewResponse {
  id: string
  status: number
  headers: Record<string, string>
  body: string           // base64 for binary, utf-8 for text
  bodyEncoding: "base64" | "utf-8"
}
```

### WebSocket relay

WebSocket upgrade on the relay port is handled separately — the hub establishes a persistent WebSocket to the kit, which maintains a persistent WebSocket to the dev server. Messages are piped bidirectionally. This is necessary for HMR.

### Hub relay server

For each kit preview target, hub starts:

```typescript
Bun.serve({
  port: 0,
  hostname: "0.0.0.0",
  fetch(req, srv) {
    // WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      return srv.upgrade(req, { data: { kitId, port } })
    }
    // HTTP: serialize → NATS request → deserialize response
    const previewReq = serializeRequest(req, port)
    const response = await nc.request(previewRequestSubject(kitId), encode(previewReq))
    return deserializeResponse(response)
  },
  websocket: { /* bidirectional pipe to kit WS relay */ }
})
```

### Tunnel strategy

```typescript
interface TunnelStrategy {
  createTunnel(localPort: number): Promise<{ url: string; stop: () => void }>
}

// Implementations:
class CloudflaredTunnel implements TunnelStrategy { /* reuse share.ts */ }
class PinggyTunnel implements TunnelStrategy { /* ssh -R */ }
class BoreTunnel implements TunnelStrategy { /* bore local */ }
class DirectPortTunnel implements TunnelStrategy { /* no tunnel, just advertise port */ }
```

Default: cloudflared (already a dependency).

### Client surface

Hub publishes preview availability in NATS snapshots:

```typescript
interface PreviewSnapshot {
  kitId: string
  targets: Array<{
    port: number
    label: string
    relayPort: number            // for LAN access
    tunnelUrl?: string           // for remote access
  }>
}
```

Client renders preview in an iframe. The iframe URL is:

- LAN: `http://<hub-host>:<relayPort>/`
- Remote: `<tunnelUrl>/`
Client auto-detects: try LAN relay first, fall back to tunnel URL after timeout.

### Wildcard domain mode

If `TINKARIA_PREVIEW_DOMAIN` is set (e.g. `tinkaria.example.com`), hub uses subdomain routing on its main port instead of separate relay ports:

- `Host: p-5173-kitlocal.tinkaria.example.com` → relay to kit preview
- No extra ports, no tunnel needed
- Requires wildcard DNS configuration
This is the "or wildcard domain" alternative for users with their own infrastructure.

## Affected Components

| Component | Change |
| --- | --- |
| c3-208 kit-runtime | Add previewTargets to registration, add NATS preview relay handler on kit side |
| c3-203 cli | Configuration for tunnel strategy and optional wildcard domain |
| c3-205 nats-transport | New NATS subjects for preview relay |
| c3-215 share | Extract TunnelStrategy interface from existing cloudflared code |
| server.ts (hub) | Start relay servers per preview target, manage tunnel lifecycle, wildcard host routing |
| nats-publisher | Include preview snapshots in broadcasts |
| Client (new component) | Preview panel with iframe, LAN/tunnel auto-detection |

## Risks

- NATS request/reply has a message size limit (~1MB default). Large assets (source maps, images) may exceed it. Mitigation: chunk large responses or stream via JetStream.
- Cloudflared quick tunnels have undocumented rate limits. Heavy asset loading during page refresh may hit them. Mitigation: pluggable tunnel strategy allows switching to bore/ngrok.
- WebSocket relay through NATS adds latency to HMR. For local kit this is negligible (sub-ms NATS hop). For remote kit, HMR latency may be noticeable.
- Each preview target consumes one ephemeral port and optionally one tunnel process. Projects with many preview ports (API + UI + docs + storybook) could accumulate overhead.

## Acceptance Criteria

- A mobile PWA viewer on a different device can see a live Vite dev server running on the developer's machine.
- HMR/live-reload works through the preview (WebSocket passthrough).
- Dev server sees all requests at root `/` — zero path rewriting.
- Tunnel strategy is pluggable — can swap cloudflared for another service without changing the preview flow.
- Preview URLs are published to the client via NATS snapshots.
- Wildcard domain mode works as an alternative to tunnel mode when configured.

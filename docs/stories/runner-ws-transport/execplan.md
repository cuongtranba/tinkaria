# Exec Plan

## Goal

Make remote-runner turns work by routing the runner's NATS over the reliable
WS-through-3210 path instead of raw TCP :4222.

## Scope

In scope: runner connects via `wsconnect` to `/nats-ws`; pairing derives + stores
`natsWsProxyUrl` from the server URL; credential field; TCP fallback.

Out of scope: server pairing-response changes; removing TCP; tailscale config.

## Risk Classification

Flags: External systems (NATS transport), Public contracts (credential shape),
Existing behavior (runner connection), Cross-platform (runner). No hard gate.

## Work Phases

1. Root cause (A): /connz confirmed sub registered + pending=0; raw :4222 delivery fails. ✓
2. Implement runner WS connect + pairing URL derivation + credential field + fallback. ✓
3. Local verification: WS runner connects via proxy (cid=57, nats.ws, 127.0.0.1), subs registered. ✓
4. Remote verification: operator re-pairs + runs runner; turn completes (no timeout). ← pending operator

## Stop Conditions

Pause if WS-through-proxy turns out to be incompatible with Kvm/JetStream (it is not —
verified locally).

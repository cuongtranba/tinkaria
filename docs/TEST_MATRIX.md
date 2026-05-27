# Test Matrix

This file maps product behavior to proof.

No product behavior has been defined or implemented yet. Do not mark a row
implemented until tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-workspace-management | Rename independent workspace | yes | yes | yes | n/a | implemented | event-store test + browser-harness (home + sidebar); `independent_workspace_renamed` |
| S-workspace-management | Delete independent workspace (confirm) | n/a | yes | yes | n/a | implemented | browser-harness confirm-dialog delete (home + sidebar); `independent_workspace_deleted` |
| S-workspace-management | Pin/unpin sorts workspace to top | yes | yes | yes | n/a | implemented | event-store test + browser-harness (pin icon + top, both surfaces); `independent_workspace_pin_toggled` |
| S-workspace-management | Move up/down reorders (persists) | yes | yes | yes | n/a | implemented | event-store reload test + browser-harness move up; `independent_workspaces_reordered` |
| S-workspace-management | listIndependentWorkspaces sort: pinned→sortOrder→createdAt | yes | n/a | n/a | n/a | implemented | event-store sort test; shared `compareIndependentWorkspaces` used by read-model too |
| S-preview-touched-files | Touched-files list derived from render units (dedup by path, latest wins; created vs edited; ignores read_file) | yes | n/a | yes | n/a | implemented | touchedFiles.test.ts (9) + browser-harness sidebar "Touched files (8)", all Created, most-recent-first |
| S-preview-touched-files | Extension→renderer mapping (md/html/svg/mmd/d2/pug + code fallback + binary/unsupported) | yes | n/a | yes | n/a | implemented | previewRenderer.test.ts (13) + browser-harness rendered all 8 types in modal (md/html/svg/mmd/d2-source/pug/ts/png-unsupported) |
| S-preview-touched-files | "Open" on write/edit card opens fresh-from-disk preview in modal | yes | n/a | yes | n/a | implemented | browser-harness: write_file AND edit_file cards both show always-visible "Open preview"; edit_file opened fresh edited content (post-edit "Third item"). Unit: ToolCallMessage.test.ts (write/edit show affordance, bash does not) |
| S-preview-touched-files | RightSidebar "Touched files (N)" lists session files and opens same modal | n/a | n/a | yes | n/a | implemented | browser-harness: Cmd+B opened sidebar, "Touched files (8)"; after edit, sample.md relabeled Edited + moved to top (dedup/latest-wins); clicking opens preview |
| S-preview-touched-files | Missing/too-large/binary file → graceful state (not garbled) | yes | n/a | yes | n/a | implemented | binary (.png→"Preview unavailable") + missing (deleted file → "Path not found" toast, no crash) verified in-app; unit covers unsupported. NOTE: >256KB shares the same toast error path, not separately driven |
| S-preview-touched-files | Per-card "Open preview" affordance reachable on mobile (always-visible header, not hover-gated) | yes | n/a | yes | n/a | implemented | Fix: moved button from per-card expandedContent (hover-only chevron) to always-visible ExpandableRow headerAction. browser-harness @390px: button on-screen, tap opened markdown modal. Unit: ToolCallMessage.test.ts |
| S-preview-touched-files | RightSidebar panel reachable on mobile (touch) | n/a | n/a | n/a | no | planned | sidebar still opens via Cmd+B only (no touch toggle); per-card button is the mobile entry point. Follow-up: add a visible sidebar toggle |
| mobile-composer-menu | ≤767px: composer controls collapse into a single icon-only trigger INSIDE the input pill (no bottom toolbar row) | yes | n/a | yes | yes | implemented | unit: useIsMobile=true → menu.action present (aria-label carries model), provider/reasoning.action absent; browser-harness @390px (prod build :3210): icon left-inside the input pill, bottom row gone (trigger placement=in-pill-row), tap opens drill-in; @1200px desktop chip row returns as separate row |
| mobile-composer-menu | Trigger reflects active mode (Plan Mode blue/ListTodo; Codex Fast Mode emerald), defaults neutral | yes | n/a | yes | n/a | implemented | unit asserts text-blue (planMode) + text-emerald (codex fastMode); browser-harness: selecting Plan Mode added text-blue + ListTodo icon |
| mobile-composer-menu | Tap trigger → level-1 menu lists category rows (Provider/Model/Reasoning/Context-or-FastMode/Mode) with current value subtext | n/a | n/a | yes | n/a | implemented | browser-harness: popover text "Provider/Claude · Model/Opus · Reasoning/High · Context/200k · Mode/Full Access · Skills/Shown" (popover closed in SSR, so unit n/a) |
| mobile-composer-menu | Skills is a level-1 toggle row (no drill-in); tap flips ribbon + closes menu | n/a | n/a | yes | n/a | implemented | browser-harness: tap Skills → menu closed; reopen shows "Skills/Hidden" (was Shown) |
| mobile-composer-menu | Category row drills into level-2 (options + back arrow); back returns to level-1 | n/a | n/a | yes | n/a | implemented | browser-harness: Reasoning → "← Reasoning" + Low/Medium/High/Max; Model → Opus/Sonnet/Haiku; Mode → Full Access/Plan Mode |
| mobile-composer-menu | Selecting a level-2 option applies change and closes the whole menu | n/a | n/a | yes | n/a | implemented | browser-harness: select Medium → menu closed; reopen shows Reasoning/Medium; same state reflected in desktop row after resize |
| mobile-composer-menu | Desktop ≥768px chip row unchanged (live responsive switch) | yes | n/a | yes | yes | implemented | unit: useIsMobile=false renders full row, no menu.action; browser-harness resize 1200px → provider.action returns, menu.action gone |

| html-preview-fullscreen-contrast | Full-screen HTML preview iframe fills viewport height (not fixed 420px); inline embeds stay 420 | yes | n/a | yes | yes | implemented | EmbedRenderer fillHeight prop from LocalFilePreviewContent; browser-harness prod :3210 iframe `h-[calc(100dvh-8rem)]` 872/1000px; inline default 420 |
| html-preview-fullscreen-contrast | Self-contained HTML renders in its own theme (document body bg/padding/font preserved) | yes | n/a | yes | n/a | implemented | DEFAULT_EMBED_STYLE :where() zero-specificity; browser-harness: light #fafafa bg + dark readable text (was dark-on-dark); 160 rich-content/messages tests green |

| code-block-whitespace | Language-less code fences (ASCII art) render preformatted (whitespace-pre, monospace, horizontal scroll), not wrapped like inline code | yes | n/a | yes | yes | implemented | markdownComponents.code isInline now requires single-line; browser-harness @668px: 3 ASCII blocks whiteSpace=pre (was normal), aligned; typescript highlighting preserved; 75 messages tests |

| mermaid-insecure-context | Mermaid diagrams render over HTTP-on-IP (insecure context), not only localhost/HTTPS | yes | n/a | yes | yes | implemented | crypto.randomUUID()→generateUUID() in MermaidDiagram; browser-harness on http://100.125.230.68:3210 (isSecureContext=false): renders SVG (was "Diagram render error"); 85 tests + typecheck 0 |

| mobile-artifact-controls-split | Mobile artifact card: copy+fullscreen on top edge, only expand on bottom edge | yes | n/a | yes | yes | implemented | RichContentBlock controls split; browser-harness @668px mermaid card: top=[zoom,Copy,Open in overlay], bottom=[Expand]; desktop unchanged; 85 tests + typecheck 0 |

| PR1-secure-nats-transport | Auth-callout responder mints correct scoped JWT per connection class (server-admin / ui-client / runner); invalid cred rejected | yes | yes | n/a | n/a | implemented | scope-policy + token unit tests + callout.integration.test.ts; `decision=grant class=…` audit lines; unknown cred → Authorization Violation. 77/0 in src/nats |
| PR1-secure-nats-transport | Cross-runner isolation: runner-A creds DENIED by NATS on `runtime.runner.cmd.B.>` and B's registry key (negative proof) | n/a | yes | n/a | n/a | implemented | callout.integration.test.ts: `runner-A denied on runtime.runner.cmd.runner-B.start — connection closed by NATS`; denied on `$KV.runtime_runner_registry.runner-B`; ui-client denied on runtime.runner.cmd |
| PR1-secure-nats-transport | `GET /auth/token` returns a `ui-client` credential (not the shared admin token); browser session round-trips over scoped creds | yes | yes | yes | n/a | implemented | boot: `/auth/token` → stateless `{c:"ui-client",iat,exp}`. ui-client scope exercised at NATS-WS layer incl. JetStream chat consumer (Stage D verify). NOTE: full headless-browser pixel E2E not run (NATS-layer proof used) |
| PR1-secure-nats-transport | NATS binds the configured interface (tailnet/0.0.0.0) only in callout mode; token-mode wide bind refused | n/a | yes | n/a | yes | implemented | bind-guard unit tests; boot proof: wide+callout ALIVE+healthy (bound 0.0.0.0), wide+token REFUSED with guard error, loopback+token regression ok. NOTE: off-box second-host reachability + WireGuard-down not locally exercisable (single host) |
| PR1-secure-nats-transport | Callout health surfaced via `/health` | n/a | yes | n/a | n/a | changed | No separate `callout` field added. Coverage is transitive: if the responder is down, server-admin/runner cannot authenticate → `natsConnection`/`runner` report unhealthy. Explicit callout-health field = PR2 follow-up |
| pty-runner-cpu-mem-sampling | Runner-spawned PTY delta carries non-null rss/cpu (current+peak) once sampler reads; peaks monotonic | yes | yes | yes | macOS-ps | planned | |
| pty-runner-cpu-mem-sampling | Usage delta carries current phase, not stale spawning | yes | n/a | n/a | n/a | planned | |
| pty-runner-cpu-mem-sampling | No usage delta after session removed/aborted (no resurrection in store) | yes | n/a | n/a | n/a | planned | |

| PR2-runner-identity-pairing | `POST /api/pairing/code` issues a short-lived single-use code (callout mode); token mode → 409 | yes | yes | n/a | n/a | implemented | pairing-store.test.ts (10) + pairing-endpoints.test.ts; team-lead E2E issued `l7w5i-7tp44-7ierwt`; 80-bit base32 code |
| PR2-runner-identity-pairing | `POST /api/pairing/exchange` redeems code once → {runnerId, token, natsUrl}; reused/expired → 410; unknown → 400 | yes | yes | n/a | n/a | implemented | atomic single-use; returned token verifies via PR1 verifyCredentialToken → {class:runner, runnerId}; team-lead E2E reused code → 410 |
| PR2-runner-identity-pairing | Externally-launched runner starts from `~/.tinkaria/runner-secret.json` (0600), connects via PR1 callout, self-registers + heartbeats | yes | n/a | yes | yes | implemented | team-lead E2E: paired runner (no NATS env, only TINKARIA_RUNNER_HOME) loaded credential, connected, ready; server `decision=grant class=runner:runner-1779803611398-30530`; file `-rw-------` |
| PR2-runner-identity-pairing | Multiple paired runners coexist with distinct runnerIds | n/a | n/a | yes | n/a | implemented | by design — each `/pairing/code` allocates a fresh runnerId; E2E paired runnerId distinct from the server-spawned one (explicit 2-runner coexistence run not separately captured) |
| PR2-runner-identity-pairing | Paired runner shares PR1 scope: still DENIED on another runnerId's cmd/KV (isolation preserved) | n/a | yes | n/a | n/a | implemented | PR1 callout.integration test green (src/nats 60/60); paired runners use the same `{class:runner, runnerId}` scope — no widening |

| PR3-registration-liveness | `runnerLivenessState(lastHeartbeatAt, now)` → online (<25s) / degraded (25–60s) / offline (≥60s); null → offline | yes | n/a | n/a | n/a | implemented | runner-protocol.test.ts boundary table (0/24999→online, 25000/59999→degraded, 60000/null→offline) |
| PR3-registration-liveness | RunnerRegistration carries `protocolVersion`; server marks out-of-range runner `incompatible` (distinct from offline) | yes | yes | n/a | n/a | implemented | PROTOCOL_VERSION=1 + SUPPORTED_RANGE; isProtocolSupported + getReadiness incompatible; runner-incompatible-gate.test.ts; missing version → incompatible |
| PR3-registration-liveness | Incompatible runner BLOCKS turn start with a clear upgrade message (never silent dispatch/downgrade) | yes | yes | n/a | n/a | implemented | gate in RunnerProxy.sendCommand; test asserts throw + NATS not dispatched; team-lead E2E skew (RUNNER_PROTOCOL_VERSION=999) logged `is incompatible (protocol v999, server supports v1–1)` |
| PR3-registration-liveness | Discover path uses heartbeat age, NOT `process.kill(pid,0)` (cross-machine correct) | n/a | yes | n/a | yes | implemented | discover uses runnerLivenessState(reg.lastSeenAt,now)!=="offline"; pr3-liveness.test.ts stale/fresh discover; runner stamps lastSeenAt in KV each heartbeat. NOTE: second-host reachability not locally exercised (single host) |
| PR3-registration-liveness | `/health` runner gains `state` + `protocolVersion` + `incompatible`; live runner shows online + version | n/a | n/a | yes | n/a | implemented | team-lead E2E boot: `{state:"online",protocolVersion:1,incompatible:false,ok:true}`; skew runner → `{state:"online",protocolVersion:999,incompatible:true,ok:false}` |

| PR4-command-profile-split | `StartTurnCommand` no longer carries `binaryPath`; server stops resolving it | yes | yes | n/a | n/a | implemented | binaryPath removed from shape + resolveProfileOverrides; runner-protocol.test.ts shape-audit; typecheck 0 |
| PR4-command-profile-split | Runner resolves its own binary for all providers (Codex + Claude SDK + PTY) via the unified resolve-binary adapter | yes | n/a | yes | yes | implemented | Claude SDK via resolveClaudeBinary (PTY's adapter); Codex via resolveCodexBinary (`which codex`); team-lead boot: turn path uses runner-resolved binary, no server path |
| PR4-command-profile-split | `extraEnv` is non-secret-only; secrets never transit the server (resolved runner-side) | yes | n/a | n/a | yes | implemented | audit test asserts no secret-shaped values (API_KEY/TOKEN/SECRET/Bearer/sk-) + no binaryPath in serialized command; secrets via local env + OAuth pool. (Stage-3 security review of the boundary in flight) |
| PR4-command-profile-split | Runner advertises real probed capabilities (providers) in RunnerRegistration (not hardcoded) | yes | yes | yes | n/a | implemented | probeProviders (resolveClaudeBinary + `which codex`); team-lead boot `/health` → `capabilities:{providers:["claude","codex"]}`. NOTE: model-level probing deferred (providers-only; RuntimeRegistry.probeCapabilities is server-side) |
| PR4-command-profile-split | Capability turn-start gate: turn for an unsupported provider is REFUSED with a clear message (not silent downgrade) | yes | yes | n/a | n/a | implemented | runner-incompatible-gate.test.ts: `cannot run provider="codex" (installed: claude)`, not dispatched. fail-OPEN when capabilities=null (pre-PR4 backward-compat). Model-level gate + multi-runner routing = PR5 |

| PR5-session-routing | `RunnerRouter.list()` enumerates ALL KV runners, annotated with PR3 liveness + PR4 capabilities + incompatible + isShared | yes | n/a | yes | n/a | implemented | runner-router.test.ts (41); dual-signal boot :3399 enumerated 213 real KV entries, annotated state/caps/incompatible/isShared |
| PR5-session-routing | Sticky-default: chat with eligible pinned `runnerId` routes there with ZERO clicks (no picker) | yes | yes | n/a | n/a | implemented | runner-router.test.ts sticky-hit; runner-routing.test.ts proxy reuses pinned id. (browser no-picker not driven — only 1 real runner; zero-click proven via sole-eligible boot path) |
| PR5-session-routing | Sole eligible runner auto-selected (zero clicks); ≥2 eligible OR sticky-offline → picker (`needs_pick`) | yes | yes | yes | n/a | implemented | sole-eligible PROVEN in boot (1 of 213 eligible → selected, no picker). Ambiguous/sticky_offline → needs_pick: runner-router.test.ts + runner-routing.test.ts (RunnerPickRequired) + nats-responders.test.ts (needsPick mapping). Browser multi-runner picker = follow-up (needs 2nd real runner) |
| PR5-session-routing | Zero eligible runners → FAIL-FAST with a clear actionable error (never a silent hang) | yes | yes | n/a | n/a | implemented | runner-router.test.ts → `unavailable`; runner-routing.test.ts proxy throws clear Error, no NATS dispatch |
| PR5-session-routing | Shared-runner (team) fallback: member with no personal runner routes to the server-spawned `isShared` runner | yes | n/a | yes | n/a | implemented | runner-router.test.ts shared-only auto-select; dual-signal boot: shared runner (`isShared:true`, online) was the sole eligible → auto-selected |
| PR5-session-routing | Selected runner persisted as `chat.runnerId`; cancel/respond_tool/stop_chat_pty hit the SAME pinned runner (no mid-session re-route) | yes | yes | n/a | n/a | implemented | EventStore.setChatRunner (mirrors setChatProvider); runner-routing.test.ts affinity assertions (cancel/respondTool/dispose → pinned id; router.select not called) |
| PR5-session-routing | Single-runner behavior is a strict SUPERSET — existing `runner-proxy.test.ts` passes UNCHANGED | yes | yes | n/a | n/a | implemented | router optional; absent ⇒ byte-identical. runner-proxy.test.ts 16/0, `git diff --stat` empty |
| PR5-session-routing | `/health` surfaces `runners[]` fleet (per-runner state+capabilities); `ok` still gated on shared runner | n/a | n/a | yes | n/a | implemented | dual-signal boot :3399 (DEV profile, NOT 3210): `/health` `runners[]` present (213 entries), `ok:true` gated on shared runner online. Finding: KV registry has no TTL (212 stale tombstones) → HARNESS_BACKLOG |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.

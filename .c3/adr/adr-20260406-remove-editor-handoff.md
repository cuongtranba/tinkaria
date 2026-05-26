---
id: adr-20260406-remove-editor-handoff
c3-seal: ea7dd188ad961981740d309a96f560ba30995872237d9dc1f09f95f3eed5382b
title: remove-editor-handoff
type: adr
goal: Remove all code related to handing off work to an external code editor (VS Code, Cursor, Windsurf, etc). The webview now handles all content display with embedded previews, making editor handoff unnecessary.
status: proposed
date: "2026-04-06"
---

## Goal

Remove all code related to handing off work to an external code editor (VS Code, Cursor, Windsurf, etc). The webview now handles all content display with embedded previews, making editor handoff unnecessary.

## Scope

### Remove entirely

- `src/server/external-open.ts` — editor open logic (keep `open_finder` if used standalone, but this file is mostly editor code)
- `src/server/keybindings.ts` + test — KeybindingsManager (settings page removed, no UI to configure)
- `src/client/lib/keybindings.ts` + test — client keybinding resolution

### Remove editor-specific code from

- `src/shared/protocol.ts` — `EditorPreset`, `EditorOpenSettings`, `keybindings` subscription topic, `settings.readKeybindings`, `settings.writeKeybindings`, `open_editor` from openExternal action
- `src/shared/types.ts` — `KeybindingsSnapshot`, `KeybindingAction`, `DEFAULT_KEYBINDINGS`
- `src/shared/branding.ts` — `getKeybindingsFilePath`, `getKeybindingsFilePathDisplay`
- `src/client/stores/terminalPreferencesStore.ts` — all editor preset functions/state
- `src/client/app/useTinkariaState.ts` — keybindings subscription, editor label, handleOpenExternal editor branch
- `src/client/app/ChatPage.tsx` — keybindings import/resolution, open_editor handler
- `src/client/components/chat-ui/ChatNavbar.tsx` — "Open in Editor" button, `open_editor` from onOpenExternal type
- `src/server/nats-publisher.ts` — keybindings dependency, keybindings snapshot case
- `src/server/nats-responders.ts` — keybindings/openExternal handlers
- `src/server/server.ts` — KeybindingsManager initialization/disposal
- `src/server/branding-migration.ts` + test — keybindings migration path

## Decision

Remove. The webview with embedded content rendering replaces the need for editor handoff.

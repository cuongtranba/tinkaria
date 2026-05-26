import { useState } from "react"
import { Terminal } from "lucide-react"
import { Button } from "../components/ui/button"
import type { AppState } from "./useAppState"

interface ClaudePtyTabProps {
  state: AppState
}

const STORAGE_KEY = "tinkaria.claude-pty.settings"

interface ClaudePtySettings {
  enabled: boolean
  binaryPath: string
  oauthTokens: Array<{ label: string; masked: string }>
}

function readSettings(): ClaudePtySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ClaudePtySettings
  } catch {
    // ignore
  }
  return { enabled: false, binaryPath: "", oauthTokens: [] }
}

function writeSettings(s: ClaudePtySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

export function ClaudePtyTab(_props: ClaudePtyTabProps) {
  const [settings, setSettings] = useState<ClaudePtySettings>(() => readSettings())

  const update = (patch: Partial<ClaudePtySettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    writeSettings(next)
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Terminal className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Claude PTY</h2>
        <span className="text-xs text-amber-600 dark:text-amber-400">preview — no sandbox</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Run the local <code className="font-mono">claude</code> CLI inside a PTY,
        billed against an OAuth pool token. Driver wiring is in progress —
        spawn is not yet active.
      </p>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="size-4"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <span className="text-sm">Enable Claude PTY provider</span>
      </label>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">
          Binary path
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            (blank = resolve from PATH)
          </span>
        </label>
        <input
          type="text"
          className="rounded border bg-background px-3 py-2 text-sm font-mono"
          placeholder="/usr/local/bin/claude"
          value={settings.binaryPath}
          onChange={(e) => update({ binaryPath: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">OAuth pool tokens</span>
          <Button type="button" variant="outline" size="sm" disabled>
            Add token
          </Button>
        </div>
        {settings.oauthTokens.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No tokens configured.</p>
        ) : (
          <ul className="text-xs font-mono">
            {settings.oauthTokens.map((t, i) => (
              <li key={i}>{t.label}: {t.masked}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Smoke test</span>
        <p className="text-xs text-muted-foreground">
          Status will appear here after first spawn against the configured binary.
        </p>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from "react"
import { Terminal, Trash2 } from "lucide-react"
import { Button } from "../components/ui/button"
import {
  OAUTH_TOKEN_LABEL_MAX,
  OAUTH_TOKEN_MAX_CONCURRENT_MAX,
  OAUTH_TOKEN_MAX_CONCURRENT_MIN,
  type ClaudeAuthSettings,
  type OAuthTokenEntry,
} from "../../shared/types"
import type { AppState } from "./useAppState"
import {
  oauthAdd,
  oauthList,
  oauthRemove,
  oauthSetConcurrencyDefault,
  oauthUpdate,
  subscribeOAuthChanged,
} from "../lib/oauth-client"

interface ClaudePtyTabProps {
  state: AppState
}

const STORAGE_KEY = "tinkaria.claude-pty.settings"

interface LocalSettings {
  enabled: boolean
  binaryPath: string
}

function readLocal(): LocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        return {
          enabled: Boolean(parsed.enabled),
          binaryPath: typeof parsed.binaryPath === "string" ? parsed.binaryPath : "",
        }
      }
    }
  } catch {
    // ignore
  }
  return { enabled: false, binaryPath: "" }
}

function writeLocal(s: LocalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

function maskToken(token: string): string {
  if (token.length <= 12) return "•".repeat(token.length)
  return `${token.slice(0, 6)}…${token.slice(-4)}`
}

function formatTimestamp(ms: number | null): string {
  if (!ms) return "never"
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return String(ms)
  }
}

function statusColor(status: OAuthTokenEntry["status"]): string {
  switch (status) {
    case "active": return "text-green-600 dark:text-green-400"
    case "limited": return "text-amber-600 dark:text-amber-400"
    case "error": return "text-red-600 dark:text-red-400"
    case "disabled": return "text-muted-foreground"
  }
}

export function ClaudePtyTab({ state }: ClaudePtyTabProps) {
  const [local, setLocal] = useState<LocalSettings>(() => readLocal())
  const [settings, setSettings] = useState<ClaudeAuthSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState("")
  const [draftToken, setDraftToken] = useState("")
  const [draftConcurrent, setDraftConcurrent] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await oauthList(state.socket)
      setSettings(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [state.socket])

  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeOAuthChanged(state.socket, (s) => setSettings(s))
    return unsubscribe
  }, [state.socket, refresh])

  const updateLocal = (patch: Partial<LocalSettings>) => {
    const next = { ...local, ...patch }
    setLocal(next)
    writeLocal(next)
  }

  const handleAdd = async () => {
    const label = draftLabel.trim()
    if (!label || !draftToken) {
      setError("Label and token are required.")
      return
    }
    setError(null)
    try {
      const maxConcurrent = draftConcurrent ? Number(draftConcurrent) : undefined
      await oauthAdd(state.socket, {
        label,
        token: draftToken,
        ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
      })
      setDraftLabel("")
      setDraftToken("")
      setDraftConcurrent("")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (id: string) => {
    setError(null)
    try {
      await oauthRemove(state.socket, id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleConcurrencyChange = async (id: string, raw: string) => {
    setError(null)
    try {
      if (raw.trim() === "") {
        await oauthUpdate(state.socket, id, { maxConcurrent: null })
      } else {
        const value = Number(raw)
        await oauthUpdate(state.socket, id, { maxConcurrent: value })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDefaultConcurrencyChange = async (raw: string) => {
    setError(null)
    try {
      const value = Number(raw)
      if (Number.isFinite(value)) {
        await oauthSetConcurrencyDefault(state.socket, value)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Terminal className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Claude PTY</h2>
        <span className="text-xs text-amber-600 dark:text-amber-400">preview — no sandbox</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Run the local <code className="font-mono">claude</code> CLI inside a PTY,
        billed against an OAuth-pool token. Add at least one OAuth token below;
        new chats with the Claude (PTY) provider will pick from the pool automatically.
      </p>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="size-4"
          checked={local.enabled}
          onChange={(e) => updateLocal({ enabled: e.target.checked })}
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
          value={local.binaryPath}
          onChange={(e) => updateLocal({ binaryPath: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">OAuth pool tokens</h3>
          {loading ? <span className="text-xs text-muted-foreground">loading…</span> : null}
        </div>

        {error ? (
          <div className="rounded border border-red-400/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {settings && settings.tokens.length > 0 ? (
          <table className="text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Label</th>
                <th className="text-left py-2 px-2 font-medium">Token</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Concurrency</th>
                <th className="text-left py-2 px-2 font-medium">Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settings.tokens.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-2 px-2">{t.label}</td>
                  <td className="py-2 px-2 font-mono">{maskToken(t.token)}</td>
                  <td className={`py-2 px-2 font-medium ${statusColor(t.status)}`}>
                    {t.status}
                    {t.status === "error" && t.lastErrorMessage ? (
                      <span className="ml-1 text-muted-foreground font-normal">
                        ({t.lastErrorMessage.slice(0, 40)})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={OAUTH_TOKEN_MAX_CONCURRENT_MIN}
                      max={OAUTH_TOKEN_MAX_CONCURRENT_MAX}
                      className="w-16 rounded border bg-background px-2 py-1 text-xs"
                      placeholder={String(settings.concurrencyDefault)}
                      defaultValue={t.maxConcurrent ?? ""}
                      onBlur={(e) => handleConcurrencyChange(t.id, e.target.value)}
                    />
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">{formatTimestamp(t.lastUsedAt)}</td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(t.id)}
                      title="Remove token"
                    >
                      <Trash2 className="size-3.5 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-muted-foreground italic">No tokens configured.</p>
        )}

        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">Add new token</span>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              maxLength={OAUTH_TOKEN_LABEL_MAX}
              placeholder="Label (e.g. Personal)"
              className="rounded border bg-background px-3 py-2 text-sm flex-1"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
            />
            <input
              type="password"
              placeholder="OAuth token"
              className="rounded border bg-background px-3 py-2 text-sm font-mono flex-1"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
            />
            <input
              type="number"
              min={OAUTH_TOKEN_MAX_CONCURRENT_MIN}
              max={OAUTH_TOKEN_MAX_CONCURRENT_MAX}
              placeholder="concurrency"
              className="rounded border bg-background px-3 py-2 text-sm w-28"
              value={draftConcurrent}
              onChange={(e) => setDraftConcurrent(e.target.value)}
            />
            <Button type="button" size="sm" onClick={handleAdd} disabled={!draftLabel.trim() || !draftToken}>
              Add token
            </Button>
          </div>
        </div>

        {settings ? (
          <div className="flex items-center gap-2 border-t pt-3 text-xs">
            <span className="text-muted-foreground">Default concurrency cap</span>
            <input
              type="number"
              min={OAUTH_TOKEN_MAX_CONCURRENT_MIN}
              max={OAUTH_TOKEN_MAX_CONCURRENT_MAX}
              defaultValue={settings.concurrencyDefault}
              className="w-16 rounded border bg-background px-2 py-1 text-xs"
              onBlur={(e) => handleDefaultConcurrencyChange(e.target.value)}
            />
            <span className="text-muted-foreground">
              applied to tokens without an explicit override
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * RunnersTab — "Add my runner" UI (PR2 Stage 2) + live runner list (US-RLL).
 *
 * Top: POST /api/pairing/code and display the returned code + one-liner.
 * Bottom: a live list of connected runners, polled from the public GET /health
 * `runners[]` every 2s while the tab is mounted. A runner that newly appears
 * after a pairing code is generated is highlighted as just-connected.
 */

import { useEffect, useRef, useState } from "react"
import { Copy, Check, Plus, Server } from "lucide-react"
import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"
import {
  filterRelevantRunners,
  newlyConnectedIds,
  runnerShortName,
  type HealthRunner,
} from "./runner-list"

interface PairingCodeResult {
  code: string
  expiresAt: number
}

const POLL_INTERVAL_MS = 2000

function CodeDisplay({ code, onCopied }: { code: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    onCopied?.()
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
      <span className="flex-1 select-all tracking-wider break-all">{code}</span>
      <Button variant="ghost" size="icon-sm" onClick={handleCopy} title="Copy code">
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  )
}

function formatExpiry(expiresAt: number): string {
  const remainMs = expiresAt - Date.now()
  if (remainMs <= 0) return "expired"
  const mins = Math.ceil(remainMs / 60_000)
  return `expires in ${mins} min`
}

/** Poll GET /health for the runner fleet. Returns relevant (online/degraded) runners. */
function useLiveRunners(): { runners: HealthRunner[]; error: string | null } {
  const [runners, setRunners] = useState<HealthRunner[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      try {
        const res = await fetch("/health")
        const body = (await res.json()) as { runners?: HealthRunner[] }
        if (cancelled) return
        setRunners(filterRelevantRunners(body.runners ?? []))
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return { runners, error }
}

function RunnerRow({ runner, justConnected }: { runner: HealthRunner; justConnected: boolean }) {
  const providers = runner.capabilities?.providers.join(", ") || "all providers"
  const dotClass = runner.state === "online" ? "bg-green-500" : "bg-yellow-500"
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
        justConnected
          ? "border-green-500/50 bg-green-500/10 ring-1 ring-green-500/30"
          : "border-border bg-muted/30",
      )}
    >
      <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", dotClass)} />
          <span className="truncate text-sm font-medium text-foreground">
            {runnerShortName(runner.runnerId)}
          </span>
          {runner.isShared && (
            <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
              shared
            </span>
          )}
          {justConnected && (
            <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
              connected
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs capitalize text-muted-foreground">
            {runner.state}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">{providers}</div>
      </div>
    </div>
  )
}

export function RunnersTab() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PairingCodeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Snapshot of relevant runnerIds taken when a pairing code is generated; any
  // runner not in this set is "newly connected" while the code session is active.
  const baselineIds = useRef<Set<string> | null>(null)

  const { runners, error: listError } = useLiveRunners()

  const newIds = baselineIds.current
    ? newlyConnectedIds(baselineIds.current, runners)
    : new Set<string>()
  const awaitingConnection = result !== null && newIds.size === 0

  async function handleGenerateCode() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/pairing/code", { method: "POST" })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as PairingCodeResult
      // Capture the current fleet so a runner that joins after this is flagged.
      baselineIds.current = new Set(runners.map((r) => r.runnerId))
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const oneliner = result
    ? `bun run src/runner/runner.ts pair --server ${window.location.origin} --code ${result.code}`
    : null

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add a runner on a remote machine. Generate a one-time pairing code, then
          run the command below on the runner machine to connect it.
        </p>

        <Button variant="outline" size="sm" onClick={handleGenerateCode} disabled={loading}>
          <Plus className="size-3.5 mr-1.5" />
          {loading ? "Generating…" : "Generate pairing code"}
        </Button>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">Pairing code</span>
              <span className="ml-auto text-xs text-muted-foreground">{formatExpiry(result.expiresAt)}</span>
            </div>

            <CodeDisplay code={result.code} />

            <p className="text-xs text-muted-foreground">On the runner machine, run:</p>
            <CodeDisplay code={oneliner!} />

            <p className="text-xs text-muted-foreground/70">
              The code is single-use and valid for ~10 minutes. The runner will appear
              below once it connects.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Connected runners</h3>
        {listError && (
          <p className="text-xs text-muted-foreground/70">Couldn’t reach the server: {listError}</p>
        )}

        {runners.map((runner) => (
          <RunnerRow key={runner.runnerId} runner={runner} justConnected={newIds.has(runner.runnerId)} />
        ))}

        {awaitingConnection && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-muted-foreground/60" />
            Waiting for a runner to connect…
          </div>
        )}

        {runners.length === 0 && !awaitingConnection && !listError && (
          <p className="text-sm text-muted-foreground">
            No runners connected. Generate a pairing code to add one.
          </p>
        )}
      </div>
    </div>
  )
}

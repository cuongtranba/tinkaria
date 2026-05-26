/**
 * RunnersTab — "Add my runner" UI (PR2 Stage 2).
 *
 * Calls POST /api/pairing/code and displays the returned code + one-liner
 * instruction. Minimal and consistent with existing tab patterns.
 */

import { useState } from "react"
import { Copy, Check, Plus, Server } from "lucide-react"
import { Button } from "../components/ui/button"

interface PairingCodeResult {
  code: string
  expiresAt: number
}

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
      <span className="flex-1 select-all tracking-wider">{code}</span>
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

export function RunnersTab() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PairingCodeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const oneliner = result
    ? `bun run src/runner/runner.ts pair --server <server-url> --code ${result.code}`
    : null

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Add a runner on a remote machine. Generate a one-time pairing code, then
        run the command below on the runner machine to connect it.
      </p>

      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerateCode}
        disabled={loading}
      >
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

          <p className="text-xs text-muted-foreground">
            On the runner machine, run:
          </p>
          <CodeDisplay code={oneliner!} />

          <p className="text-xs text-muted-foreground/70">
            The code is single-use and valid for ~10 minutes. Once used, the runner
            will connect automatically on next start.
          </p>
        </div>
      )}
    </div>
  )
}

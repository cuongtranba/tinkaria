import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import type { HydratedTranscriptMessage } from "../../../shared/types"

type RateLimitHydrated = Extract<HydratedTranscriptMessage, { kind: "rate_limit" }>

interface Props {
  message: RateLimitHydrated
}

function formatReset(resetAt: number, tz: string): string {
  try {
    const date = new Date(resetAt * 1000)
    return date.toLocaleString(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit" })
  } catch {
    return new Date(resetAt * 1000).toLocaleString()
  }
}

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function RateLimitMessage({ message }: Props) {
  const now = useNow()
  const resetMs = message.rateLimit.resetAt * 1000
  const remaining = Math.max(0, resetMs - now)
  const mins = Math.ceil(remaining / 60_000)
  const display = remaining > 0
    ? `Rate limit reached — resumes in ${mins} min (~${formatReset(message.rateLimit.resetAt, message.rateLimit.tz)})`
    : `Rate limit cleared (was reset at ${formatReset(message.rateLimit.resetAt, message.rateLimit.tz)})`

  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
      <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-warning" />
      <span>{display}</span>
    </div>
  )
}

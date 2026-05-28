/**
 * RunnerPickerDialog — PR5 Session Routing.
 *
 * Shown when the server returns needsPick:true from chat.send / chat.queue,
 * meaning there is more than one eligible runner and the user must choose.
 * Zero-click path (single runner, sticky runner online) never shows this dialog.
 */

import { useEffect, useState } from "react"
import { Server } from "lucide-react"
import type { ClientRunnerDescriptor, RunnerPickRequest } from "../../app/useChatCommands"
import type { AppTransport } from "../../app/socket-interface"
import { useRunnerTeamSubscription } from "../../app/useRunnerTeamSubscription"
import { resolveRunnerName, resolveRunnerMember } from "../../../shared/runner-team-types"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogGhostButton,
  DialogHeader,
  DialogPrimaryButton,
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
  DialogTitle,
} from "../ui/dialog"
import { cn } from "../../lib/utils"

interface Props {
  request: RunnerPickRequest | null
  onClose: () => void
  /** Called with the chosen runnerId after a successful pick + retry. */
  onPicked?: (runnerId: string) => void
  /** Optional transport for resolving operator runner names/members (US-RTN). */
  socket?: AppTransport | null
}

function stateLabel(state: ClientRunnerDescriptor["state"]): { text: string; className: string } {
  if (state === "online") return { text: "online", className: "text-green-400" }
  if (state === "degraded") return { text: "degraded", className: "text-yellow-400" }
  return { text: "offline", className: "text-muted-foreground" }
}

export function RunnerPickerDialog({ request, onClose, onPicked, socket }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const team = useRunnerTeamSubscription(socket ?? null)
  const labels = team?.runners ?? []
  const members = team?.members ?? []

  // Reset selection/error/busy when a new request arrives so prior state can't leak
  useEffect(() => {
    setSelected(null)
    setError(null)
    setBusy(false)
  }, [request])

  const candidates = request?.candidates ?? []

  async function handleConfirm() {
    if (!request || !selected) return
    setBusy(true)
    setError(null)
    try {
      await request.retry(selected)
      onPicked?.(selected)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const title = request?.reason === "sticky_offline"
    ? "Your runner is offline"
    : "Choose a runner"

  const subtitle = request?.reason === "sticky_offline"
    ? "The runner this session was using is offline. Pick another to continue."
    : "Multiple runners are available. Choose one for this session."

  return (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className={RESPONSIVE_MODAL_CONTENT_CLASS_NAME}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {candidates.map((d) => {
            const { text: stateText, className: stateClass } = stateLabel(d.state)
            const isSelected = selected === d.runnerId
            const providers = d.capabilities?.providers.join(", ") || "all providers"
            return (
              <button
                key={d.runnerId}
                type="button"
                onClick={() => setSelected(d.runnerId)}
                className={cn(
                  "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                  "flex items-start gap-3",
                  isSelected
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-muted/30 hover:bg-muted/60",
                )}
              >
                <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {resolveRunnerName(d.runnerId, labels)}
                    </span>
                    {resolveRunnerMember(d.runnerId, labels, members) && (
                      <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {resolveRunnerMember(d.runnerId, labels, members)!.name}
                      </span>
                    )}
                    {d.isShared && (
                      <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        shared
                      </span>
                    )}
                    <span className={cn("ml-auto shrink-0 text-xs", stateClass)}>{stateText}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{providers}</div>
                </div>
              </button>
            )
          })}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter className={RESPONSIVE_MODAL_FOOTER_CLASS_NAME}>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancel
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={handleConfirm}
            disabled={!selected || busy}
          >
            {busy ? "Connecting…" : "Use this runner"}
          </DialogPrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

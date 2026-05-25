import { useState } from "react"
import { Plus, Boxes, Pencil, Pin, PinOff, ArrowUp, ArrowDown, Trash2 } from "lucide-react"
import type { IndependentWorkspace } from "../../../../shared/types"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../ui/context-menu"
import { cn } from "../../../lib/utils"

interface Props {
  workspaces: IndependentWorkspace[]
  onSelect: (workspaceId: string) => void
  onCreate: () => void
  activeWorkspaceId?: string | null
  onRename?: (workspaceId: string, name: string) => void
  onTogglePin?: (workspaceId: string, pinned: boolean) => void
  onReorder?: (orderedWorkspaceIds: string[]) => void
  onDelete?: (workspaceId: string) => void
}

function SectionHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <>
      <span className="text-sm text-slate-500 dark:text-slate-400">Workspaces</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5.5 w-5.5 !rounded"
            onClick={onCreate}
          >
            <Plus className="size-3.5 text-slate-500 dark:text-slate-400" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={4}>
          New workspace
        </TooltipContent>
      </Tooltip>
    </>
  )
}

export function WorkspacesSection({
  workspaces,
  onSelect,
  onCreate,
  activeWorkspaceId,
  onRename,
  onTogglePin,
  onReorder,
  onDelete,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")

  function startRename(ws: IndependentWorkspace) {
    setRenamingId(ws.id)
    setDraftName(ws.name)
  }

  function commitRename() {
    if (renamingId) {
      const trimmed = draftName.trim()
      if (trimmed) onRename?.(renamingId, trimmed)
    }
    setRenamingId(null)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= workspaces.length) return
    const ids = workspaces.map((w) => w.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    onReorder?.(ids)
  }

  if (workspaces.length === 0) {
    return (
      <div className="p-[10px]">
        <div className="flex items-center justify-between">
          <SectionHeader onCreate={onCreate} />
        </div>
      </div>
    )
  }

  return (
    <div className="mb-1">
      <div className="sticky top-0 bg-background dark:bg-card z-10 p-[10px] flex items-center justify-between">
        <SectionHeader onCreate={onCreate} />
      </div>
      <div className="space-y-[2px]">
        {workspaces.map((ws, index) => (
          <ContextMenu key={ws.id}>
            <ContextMenuTrigger asChild>
              {renamingId === ws.id ? (
                <div
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm",
                    activeWorkspaceId === ws.id && "bg-muted"
                  )}
                >
                  <Boxes className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        commitRename()
                      } else if (e.key === "Escape") {
                        e.preventDefault()
                        setRenamingId(null)
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-foreground outline-none border-b border-border"
                  />
                </div>
              ) : (
                <button
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors",
                    "hover:bg-muted/50",
                    activeWorkspaceId === ws.id && "bg-muted"
                  )}
                  onClick={() => onSelect(ws.id)}
                >
                  {ws.pinned ? (
                    <Pin className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  ) : (
                    <Boxes className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  )}
                  <span className="truncate text-foreground">{ws.name}</span>
                </button>
              )}
            </ContextMenuTrigger>
            <ContextMenuContent>
              {onRename ? (
                <ContextMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    startRename(ws)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="text-xs font-medium">Rename</span>
                </ContextMenuItem>
              ) : null}
              {onTogglePin ? (
                <ContextMenuItem onSelect={() => onTogglePin(ws.id, !ws.pinned)}>
                  {ws.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  <span className="text-xs font-medium">{ws.pinned ? "Unpin" : "Pin"}</span>
                </ContextMenuItem>
              ) : null}
              {onReorder ? (
                <ContextMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Move up</span>
                </ContextMenuItem>
              ) : null}
              {onReorder ? (
                <ContextMenuItem
                  disabled={index === workspaces.length - 1}
                  onSelect={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                  <span className="text-xs font-medium">Move down</span>
                </ContextMenuItem>
              ) : null}
              {onDelete ? (
                <ContextMenuItem
                  onSelect={() => onDelete(ws.id)}
                  className="text-destructive dark:text-red-400 hover:bg-destructive/10 focus:bg-destructive/10 dark:hover:bg-red-500/20 dark:focus:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Delete</span>
                </ContextMenuItem>
              ) : null}
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    </div>
  )
}

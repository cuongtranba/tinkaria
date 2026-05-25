import { FilePen, FilePlus, X } from "lucide-react"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { stripWorkspacePath } from "../../lib/pathUtils"
import type { TouchedFile } from "../../lib/touchedFiles"

interface RightSidebarProps {
  onClose: () => void
  touchedFiles: TouchedFile[]
  workspacePath?: string | null
  onOpenFile: (path: string) => void
}

export function RightSidebar({ onClose, touchedFiles, workspacePath, onOpenFile }: RightSidebarProps) {
  const rightSidebarDescriptor = createUiIdentityDescriptor({
    id: "chat.right-sidebar",
    c3ComponentId: "c3-115",
    c3ComponentLabel: "right-sidebar",
  })

  return (
    <div
      {...getUiIdentityAttributeProps(rightSidebarDescriptor)}
      className="h-full min-h-0 border-l border-border bg-background md:min-w-[300px]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            Touched files{touchedFiles.length > 0 ? ` (${touchedFiles.length})` : ""}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close right sidebar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {touchedFiles.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">No files touched yet</p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="flex flex-col py-1">
              {touchedFiles.map((file) => {
                const displayPath = stripWorkspacePath(file.path, workspacePath)
                const Icon = file.change === "created" ? FilePlus : FilePen
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => onOpenFile(file.path)}
                      title={`${file.change === "created" ? "Created" : "Edited"} — ${displayPath}`}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60"
                    >
                      <Icon
                        className={`size-3.5 shrink-0 ${file.change === "created" ? "text-emerald-500" : "text-amber-500"}`}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{displayPath}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

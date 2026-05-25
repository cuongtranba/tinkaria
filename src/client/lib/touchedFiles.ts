// Derives the list of files the agent created/edited this session from the
// in-memory transcript render units. Pure and UI-free. Content is read fresh
// from disk on open, so this only needs each file's path and how it was touched.

import type { HydratedToolCall, TranscriptRenderUnit } from "../../shared/types"

export type TouchedFileChange = "created" | "edited"

export interface TouchedFile {
  path: string
  change: TouchedFileChange
}

function changeForToolKind(toolKind: string): TouchedFileChange | null {
  if (toolKind === "write_file") return "created"
  if (toolKind === "edit_file") return "edited"
  return null
}

function toolCallsInUnit(unit: TranscriptRenderUnit): HydratedToolCall[] {
  if (unit.kind === "standalone_tool") return [unit.tool]
  if (unit.kind === "tool_group") return unit.tools
  if (unit.kind === "wip_block") {
    return unit.steps.filter((step): step is HydratedToolCall => step.kind === "tool")
  }
  return []
}

export function deriveTouchedFiles(units: TranscriptRenderUnit[]): TouchedFile[] {
  // path -> { change, seq } where seq is the order of the latest touch.
  const latest = new Map<string, { change: TouchedFileChange; seq: number }>()
  let seq = 0

  for (const unit of units) {
    for (const tool of toolCallsInUnit(unit)) {
      const change = changeForToolKind(tool.toolKind)
      if (change === null) continue

      const path = (tool.input as { filePath?: unknown }).filePath
      if (typeof path !== "string" || path.trim() === "") continue

      latest.set(path, { change, seq })
      seq += 1
    }
  }

  return Array.from(latest.entries())
    .sort((a, b) => b[1].seq - a[1].seq)
    .map(([path, { change }]) => ({ path, change }))
}

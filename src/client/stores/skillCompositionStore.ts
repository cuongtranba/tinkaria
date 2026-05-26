import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AgentProvider } from "../../shared/types"

interface SkillCompositionState {
  usageCounts: Record<string, number>
  ribbonVisible: boolean
  recordUsage: (skills: string[]) => void
  toggleRibbon: () => void
}

export const useSkillCompositionStore = create<SkillCompositionState>()(
  persist(
    (set) => ({
      usageCounts: {},
      ribbonVisible: true,

      recordUsage: (skills) => {
        if (skills.length === 0) return
        set((state) => {
          const next = { ...state.usageCounts }
          for (const skill of skills) {
            next[skill] = (next[skill] ?? 0) + 1
          }
          return { usageCounts: next }
        })
      },

      toggleRibbon: () => set((state) => ({ ribbonVisible: !state.ribbonVisible })),
    }),
    { name: "skill-composition" }
  )
)

const SKILL_PREFIX_PATTERN = /^\[Skills: (\/[^\]]+)\](?:\n\n?)?/

export function parseSkillsFromContent(content: string): { skills: string[] | null; content: string } {
  const match = content.match(SKILL_PREFIX_PATTERN)
  if (!match) return { skills: null, content }

  const skillsRaw = match[1]
  const skills = skillsRaw.split(", ").map((s) => s.replace(/^\//, ""))
  const remaining = content.slice(match[0].length)
  return { skills, content: remaining }
}

export function sortSkillsByFrequency(skills: string[], usageCounts: Record<string, number>): string[] {
  return [...skills].sort((a, b) => (usageCounts[b] ?? 0) - (usageCounts[a] ?? 0))
}

export function getSkillPrefix(provider: AgentProvider): string {
  return provider === "codex" ? "$" : "/"
}

export function formatSkillCommand(skill: string, provider: AgentProvider): string {
  return `${getSkillPrefix(provider)}${skill}`
}

export function computeSkillInsertion(
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
  command: string
): { value: string; cursorPosition: number } {
  const before = currentValue.substring(0, selectionStart)
  const after = currentValue.substring(selectionEnd)
  const needsLeadingSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n")
  const needsTrailingSpace = after.length === 0 || (!after.startsWith(" ") && !after.startsWith("\n"))
  const prefix = needsLeadingSpace ? " " : ""
  const suffix = needsTrailingSpace ? " " : ""
  const value = before + prefix + command + suffix + after
  const cursorPosition = selectionStart + prefix.length + command.length + suffix.length
  return { value, cursorPosition }
}

/**
 * TeamTab — operator "team" members CRUD (US-RTN).
 *
 * Members are display-only labels (no auth, no accounts). Runner naming AND
 * member assignment both live on the Runners tab — this tab manages members
 * only. State is driven by the `runner-teams` snapshot; writes go through the
 * `team.member.*` commands.
 */

import { useState } from "react"
import { Plus, Trash2, User } from "lucide-react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { useRunnerTeamSubscription } from "./useRunnerTeamSubscription"
import type { AppState } from "./useAppState"

export function TeamTab({ state }: { state: AppState }) {
  const team = useRunnerTeamSubscription(state.socket)
  const members = team?.members ?? []

  const [newName, setNewName] = useState("")

  function addMember() {
    const name = newName.trim()
    if (!name) return
    void state.socket.command({ type: "team.member.save", member: { id: crypto.randomUUID(), name } })
    setNewName("")
  }

  function renameMember(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    void state.socket.command({ type: "team.member.save", member: { id, name: trimmed } })
  }

  function removeMember(id: string) {
    void state.socket.command({ type: "team.member.remove", memberId: id })
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-foreground">Members</h3>
        <p className="text-xs text-muted-foreground">
          People you assign runners to. Labels only — no login or permissions.
          Assign runners on the Runners tab.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addMember() }}
          placeholder="Add a member (e.g. Alice)"
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={addMember} disabled={!newName.trim()}>
          <Plus className="size-3.5 mr-1.5" />
          Add
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <User className="size-4 shrink-0 text-muted-foreground" />
              <Input
                size="sm"
                defaultValue={m.name}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== m.name) renameMember(m.id, e.target.value) }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                className="h-7 max-w-xs text-sm"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                title="Remove member"
                onClick={() => removeMember(m.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

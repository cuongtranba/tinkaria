import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { RunnerTeamSnapshot } from "../../shared/runner-team-types"

/** Subscribe to the operator's runner-team snapshot (members + runner labels). US-RTN. */
export function useRunnerTeamSubscription(socket: AppTransport | null): RunnerTeamSnapshot | null {
  const [snapshot, setSnapshot] = useState<RunnerTeamSnapshot | null>(null)
  useEffect(() => {
    if (!socket) return
    return socket.subscribe<RunnerTeamSnapshot>({ type: "runner-teams" }, setSnapshot)
  }, [socket])
  return snapshot
}

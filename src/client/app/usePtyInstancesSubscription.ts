import { useEffect } from "react"
import type { AppTransport } from "./socket-interface"
import type { PtyInstanceDelta, PtyInstanceState } from "../../shared/pty-instance"
import { ptyCommandSubject, ptyDeltaSubject } from "../../shared/nats-subjects"
import { usePtyInstancesStore } from "../stores/ptyInstancesStore"

interface PtySnapshotReply {
  ok: boolean
  error?: string
  instances?: PtyInstanceState[]
}

export function usePtyInstancesSubscription(socket: AppTransport, connected: boolean): void {
  useEffect(() => {
    if (!connected) return
    let cancelled = false

    socket
      .rawRequest<PtySnapshotReply>(ptyCommandSubject("pty.snapshot"), {})
      .then((reply) => {
        if (cancelled) return
        if (reply.ok && reply.instances) {
          usePtyInstancesStore.getState().applySnapshot(reply.instances)
        }
      })
      .catch(() => undefined)

    const unsubscribe = socket.rawSubscribe<PtyInstanceDelta>(ptyDeltaSubject(), (delta) => {
      const store = usePtyInstancesStore.getState()
      if (delta.type === "added") {
        store.applyDiff({ op: "added", instance: delta.instance })
      } else if (delta.type === "updated") {
        store.applyDiff({ op: "updated", instance: delta.instance })
      } else if (delta.type === "removed") {
        store.applyDiff({ op: "removed", chatId: delta.chatId })
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [socket, connected])
}

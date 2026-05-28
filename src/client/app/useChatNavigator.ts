import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { TranscriptRenderUnit } from "../../shared/types"
import type { ChatVirtualizer } from "./ChatTranscript"
import { extractWaypoints, findCurrentWaypointIndex } from "./chatWaypoints"
import { SMOOTH_SCROLL_TIMEOUT_MS } from "./scrollFollowStore"

// How long after the last scroll activity the navigator stays visible before
// auto-hiding while the page is still.
const NAV_IDLE_HIDE_MS = 1800

// Scroll a virtualized row to the top. Uses an instant jump (not "smooth"):
// smooth-scrolling to a far index while item heights are still being measured
// left subsequent rows' offsets stale, so tall rows overlapped following ones.
// A second pass on the next frame re-lands after the target region has measured,
// which also forces the virtualizer to recompute offsets with the real sizes.
function scrollToWaypoint(virt: ChatVirtualizer, renderIndex: number) {
  virt.scrollToIndex(renderIndex, { align: "start" })
  requestAnimationFrame(() => virt.scrollToIndex(renderIndex, { align: "start" }))
}

export interface ChatNavigatorState {
  currentIndex: number
  totalCount: number
  currentLabel: string
  visible: boolean
  goNext: () => void
  goPrev: () => void
}

export function useChatNavigator({
  messages,
  scrollRef,
  virtualizerRef,
  scrollToBottom,
  beginProgrammaticScroll,
  endProgrammaticScroll,
}: {
  messages: TranscriptRenderUnit[]
  scrollRef: RefObject<HTMLDivElement | null>
  virtualizerRef: RefObject<ChatVirtualizer | null>
  scrollToBottom: () => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
}): ChatNavigatorState {
  const waypoints = useMemo(() => extractWaypoints(messages), [messages])
  const waypointsRef = useRef(waypoints)
  waypointsRef.current = waypoints
  const [currentIndex, setCurrentIndex] = useState(-1)
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex
  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while a navigator-driven smooth scroll is animating, so scroll-tracking
  // doesn't clobber the optimistic index mid-animation.
  const programmaticRef = useRef(false)

  function recomputeIndex() {
    if (programmaticRef.current) return
    const el = scrollRef.current
    const virt = virtualizerRef.current
    if (!el || !virt) return
    // Use the currently-rendered items' real offsets. measurementsCache is sparse
    // (only items that have been measured), which left far waypoints unmeasured
    // and froze the index at the first waypoint.
    const startByIndex = new Map<number, number>()
    for (const item of virt.getVirtualItems()) startByIndex.set(item.index, item.start)
    const idx = findCurrentWaypointIndex(
      waypointsRef.current,
      el.scrollTop,
      (wp) => (startByIndex.has(wp.renderIndex) ? startByIndex.get(wp.renderIndex)! : null),
    )
    // Only adopt a determinate result; keep the last known index when the current
    // waypoint isn't currently rendered.
    if (idx !== -1 && idx !== currentIndexRef.current) setCurrentIndex(idx)
  }

  const showOnActivity = useCallback(() => {
    setVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), NAV_IDLE_HIDE_MS)
  }, [])

  useEffect(() => {
    // ChatTranscript (the scroll container) is lazy-loaded, so scrollRef.current
    // is null on the first run and the ref identity never changes — a plain
    // effect would attach the listener to nothing. Poll until the element is
    // available (and re-attach if it remounts).
    let attachedEl: HTMLElement | null = null
    let ticking = false
    let rafId = 0

    function onScroll() {
      showOnActivity()
      if (ticking) return
      ticking = true
      rafId = requestAnimationFrame(() => {
        ticking = false
        recomputeIndex()
      })
    }

    function ensureAttached() {
      const el = scrollRef.current
      if (el === attachedEl) return
      if (attachedEl) attachedEl.removeEventListener("scroll", onScroll)
      attachedEl = el
      if (el) {
        el.addEventListener("scroll", onScroll, { passive: true })
        recomputeIndex()
      }
    }

    ensureAttached()
    const intervalId = setInterval(ensureAttached, 250)
    return () => {
      clearInterval(intervalId)
      cancelAnimationFrame(rafId)
      if (attachedEl) attachedEl.removeEventListener("scroll", onScroll)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [scrollRef, virtualizerRef, showOnActivity])

  // Recompute when waypoints change (new user prompt added) without reattaching listener
  useEffect(() => { recomputeIndex() }, [waypoints])

  function guardedSmoothScroll(action: () => void) {
    programmaticRef.current = true
    beginProgrammaticScroll()
    action()
    requestAnimationFrame(() => {
      setTimeout(() => {
        endProgrammaticScroll()
        programmaticRef.current = false
        recomputeIndex()
      }, SMOOTH_SCROLL_TIMEOUT_MS)
    })
  }

  const goNext = useCallback(() => {
    const virt = virtualizerRef.current
    const wps = waypointsRef.current
    if (!virt || wps.length === 0) return

    const nextIdx = currentIndexRef.current + 1
    if (nextIdx >= wps.length) {
      setCurrentIndex(wps.length - 1)
      scrollToBottom()
      return
    }

    setCurrentIndex(nextIdx)
    guardedSmoothScroll(() => scrollToWaypoint(virt, wps[nextIdx].renderIndex))
  }, [virtualizerRef, scrollToBottom, beginProgrammaticScroll, endProgrammaticScroll])

  const goPrev = useCallback(() => {
    const el = scrollRef.current
    const virt = virtualizerRef.current
    const wps = waypointsRef.current
    if (!el || !virt || wps.length === 0) return

    const prevIdx = currentIndexRef.current - 1
    if (prevIdx < 0) {
      setCurrentIndex(0)
      guardedSmoothScroll(() => el.scrollTo({ top: 0, behavior: "smooth" }))
      return
    }

    setCurrentIndex(prevIdx)
    guardedSmoothScroll(() => scrollToWaypoint(virt, wps[prevIdx].renderIndex))
  }, [scrollRef, virtualizerRef, beginProgrammaticScroll, endProgrammaticScroll])

  const currentLabel = currentIndex >= 0 && currentIndex < waypoints.length
    ? waypoints[currentIndex].label
    : waypoints.length > 0 ? waypoints[0].label : ""

  return {
    currentIndex,
    totalCount: waypoints.length,
    currentLabel,
    visible,
    goNext,
    goPrev,
  }
}

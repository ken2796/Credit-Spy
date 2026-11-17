import { useEffect, useRef, useState } from 'react'

/** How far (in px, after resistance) the page must be pulled before letting go refreshes it. */
export const PULL_THRESHOLD = 64
const MAX_PULL = 96

/**
 * Pull down from the top of the page to refresh (touch screens).
 * Returns how far the page is currently pulled, for drawing the indicator.
 */
export function usePullToRefresh(onRefresh: () => void): number {
  const [pull, setPull] = useState(0)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const refreshRef = useRef(onRefresh)

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    function set(value: number) {
      pullRef.current = value
      setPull(value)
    }
    function onStart(e: TouchEvent) {
      // Only when already at the very top, with one finger.
      startY.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null
    }
    function onMove(e: TouchEvent) {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0)
        return
      }
      set(Math.min(MAX_PULL, dy * 0.5))
    }
    function onEnd() {
      if (startY.current !== null && pullRef.current >= PULL_THRESHOLD) refreshRef.current()
      startY.current = null
      if (pullRef.current) set(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return pull
}

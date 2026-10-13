import { useEffect, useLayoutEffect, useRef } from 'react'

const POLL_FIRST_MS = 3000
const POLL_MAX_MS = 30_000
// work that never finishes (e.g. indexing that keeps failing) stops being polled
const POLL_GIVE_UP_MS = 15 * 60_000

// Calls `tick` while `active`: quickly at first, then less and less often. A failed tick just waits for
// the next one. A new `restartKey` (e.g. one more item to watch) starts over at the quick interval.
export function usePolling(active: boolean, tick: () => Promise<void>, restartKey: unknown) {
  const tickRef = useRef(tick)
  useLayoutEffect(() => {
    tickRef.current = tick
  })

  useEffect(() => {
    if (!active) return
    let delay = POLL_FIRST_MS
    let timer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()
    let stopped = false

    const run = async () => {
      try {
        await tickRef.current()
      } catch {
        // try again on the next tick
      }
      if (stopped || Date.now() - startedAt > POLL_GIVE_UP_MS) return
      delay = Math.min(delay * 1.5, POLL_MAX_MS)
      timer = setTimeout(run, delay)
    }
    timer = setTimeout(run, delay)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [active, restartKey])
}

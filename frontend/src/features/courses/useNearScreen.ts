import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

// True while the element is on screen or within about a screen of it. Drawing pages use it to
// keep canvases only for pages nearby: a full-size page canvas takes tens of MB of memory.
export function useNearScreen(ref: RefObject<HTMLElement | null>) {
  // without IntersectionObserver, every page just stays drawn
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '100% 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return near
}

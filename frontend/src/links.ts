import type { MouseEvent } from 'react'

// onClick for a real <a href>: ctrl/cmd/shift/middle-click keep their browser behaviour, a plain click navigates in place
export function inAppClick(navigate: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate()
  }
}

import { useCallback, useEffect, useState } from 'react'

import { fetchUnreadCount } from '../api/me'

const POLL_MS = 60_000

// The unread notification count for the badge: polled every minute while the tab is visible, and
// refreshed as soon as the user comes back to the tab.
export function useUnreadCount() {
  const [count, setCount] = useState(0)

  // fetches the unread count again
  const refresh = useCallback(() => {
    fetchUnreadCount()
      .then((result) => setCount(result.count))
      // a missed poll just keeps the last count; the next one will catch up
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    // refreshes when the tab is shown again
    function onVisibility() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  return { count, setCount }
}

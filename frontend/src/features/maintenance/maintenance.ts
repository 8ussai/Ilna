import { useCallback, useEffect, useRef, useState } from 'react'

import { setMaintenanceHandler } from '../../api/client'
import { fetchStatus } from '../../api/meta'
import type { MaintenanceStatus } from '../../api/meta'
import { parseServerDate } from '../../lib/dates'

// how often the site asks whether it's closed (or about to be)
const POLL_MS = 30_000
// the warning banner shows only this close to a scheduled closing
export const WARN_BEFORE_MS = 24 * 60 * 60 * 1000

type Maintenance = {
  status: MaintenanceStatus | null
  // the server's clock, so a visitor's wrong clock doesn't throw the countdown off
  serverNow: () => number
  refresh: () => void
}

// The site's maintenance state: checked on load, every 30 seconds, and at once whenever a request is refused
// because the site closed. A failed check keeps the last answer.
export function useMaintenance(): Maintenance {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null)
  // server time minus this device's time
  const offset = useRef(0)

  // several requests refused at once (e.g. the app loading) ask for one check, not one each
  const inFlight = useRef(false)

  // asks the server whether the site is open, closing soon or closed
  const refresh = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    const sentAt = Date.now()
    fetchStatus()
      .then((next) => {
        // the answer is about halfway through the round trip
        const local = (sentAt + Date.now()) / 2
        offset.current = parseServerDate(next.server_now).getTime() - local
        setStatus(next)
      })
      .catch(() => {})
      .finally(() => {
        inFlight.current = false
      })
  }, [])

  // the countdown reached zero but the answer was still "on" (it crossed in flight): ask again soon
  useEffect(() => {
    if (status?.state !== 'on' || !status.ends_at) return
    const left = parseServerDate(status.ends_at).getTime() - (Date.now() + offset.current)
    const timer = setTimeout(refresh, Math.max(left, 0) + 3000)
    return () => clearTimeout(timer)
  }, [status, refresh])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    setMaintenanceHandler(refresh)
    return () => {
      clearInterval(timer)
      setMaintenanceHandler(null)
    }
  }, [refresh])

  // the server's clock, so countdowns don't depend on the visitor's
  const serverNow = useCallback(() => Date.now() + offset.current, [])
  return { status, serverNow, refresh }
}

// the parts of a countdown; all zero once it's reached
export function countdownParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

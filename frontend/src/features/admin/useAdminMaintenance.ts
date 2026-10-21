import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchMaintenance } from '../../api/admin'
import type { MaintenanceStatus } from '../../api/meta'
import { parseServerDate } from '../../lib/dates'

const POLL_MS = 30_000

export type AdminMaintenanceState = {
  status: MaintenanceStatus | null
  serverNow: () => number
  setStatus: (status: MaintenanceStatus) => void
}

// The maintenance state for the whole panel (the banner and this page), checked every 30 seconds.
export function useAdminMaintenance(enabled: boolean): AdminMaintenanceState {
  const [status, setStatusState] = useState<MaintenanceStatus | null>(null)
  const offset = useRef(0)

  const setStatus = useCallback((next: MaintenanceStatus) => {
    offset.current = parseServerDate(next.server_now).getTime() - Date.now()
    setStatusState(next)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const load = () => fetchMaintenance().then(setStatus).catch(() => {})
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, setStatus])

  const serverNow = useCallback(() => Date.now() + offset.current, [])
  return { status, serverNow, setStatus }
}

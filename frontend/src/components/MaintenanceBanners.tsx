import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { MaintenanceStatus } from '../api/meta'
import { formatDateTime, parseServerDate } from '../dates'
import { WARN_BEFORE_MS } from '../maintenance'

const DISMISSED_KEY = 'ilna-maintenance-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

// "Ilna will be closed from ... to ...", in the last 24 hours before a scheduled closing.
// Dismissing it hides it for that closing only.
export function MaintenanceWarning({ status, serverNow }: { status: MaintenanceStatus; serverNow: () => number }) {
  const { t, i18n } = useTranslation()
  const [dismissed, setDismissed] = useState(readDismissed)
  if (status.state !== 'scheduled' || !status.starts_at || !status.ends_at) return null

  const startsAt = parseServerDate(status.starts_at)
  // one closing is told apart from the next by its times
  const key = `${status.starts_at}|${status.ends_at}`
  if (dismissed === key || startsAt.getTime() - serverNow() > WARN_BEFORE_MS) return null

  function dismiss() {
    setDismissed(key)
    try {
      localStorage.setItem(DISMISSED_KEY, key)
    } catch {
      // storage blocked; it just comes back on the next visit
    }
  }

  return (
    <div role="status" className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-5 py-2.5 text-sm sm:px-8">
        <p className="flex-1">
          {t('maintenance.warning', {
            from: formatDateTime(startsAt, i18n.language),
            to: formatDateTime(parseServerDate(status.ends_at), i18n.language),
          })}
        </p>
        <button type="button" onClick={dismiss} aria-label={t('maintenance.dismiss')} className="shrink-0 text-muted hover:text-fg">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// For a test user let in from the admin panel while everyone else sees the maintenance page.
export function MaintenanceBypassBanner({ status }: { status: MaintenanceStatus }) {
  const { t, i18n } = useTranslation()
  if (status.state !== 'on' || !status.bypass || !status.ends_at) return null
  return (
    <div role="status" className="border-b border-accent/40 bg-accent/10">
      <p className="mx-auto max-w-6xl px-5 py-2.5 text-sm sm:px-8">
        {t('maintenance.bypass', { time: formatDateTime(parseServerDate(status.ends_at), i18n.language) })}
      </p>
    </div>
  )
}

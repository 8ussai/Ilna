import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ADMIN_USERS_PAGE, endMaintenance, fetchAdminUsers, fetchMaintenance, scheduleMaintenance } from '../../api/admin'
import type { AdminUser } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { MaintenanceStatus } from '../../api/meta'
import { controlClass, FieldMessage } from '../../components/Field'
import { MaintenanceScreen } from '../../components/MaintenanceScreen'
import { dangerButtonInline, primaryButtonInline, secondaryButtonInline, smallSecondaryButton } from '../../components/styles'
import { formatDateTime, formatRelative, parseServerDate } from '../../dates'
import { openSiteAs } from './openSiteAs'

// matches MAINTENANCE_MESSAGE_MAX in backend/backendConfig.py
const MESSAGE_MAX = 1000
const POLL_MS = 30_000
const MINUTE = 60_000
const QUICK_ENDS = [
  { key: 'm30', ms: 30 * MINUTE },
  { key: 'h1', ms: 60 * MINUTE },
  { key: 'h2', ms: 120 * MINUTE },
  { key: 'd1', ms: 24 * 60 * MINUTE },
] as const

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

// for <input type="datetime-local">, which works in the admin's own time zone
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): Date | null {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime()) ? date : null
}

export function AdminMaintenance({ maintenance }: { maintenance: AdminMaintenanceState }) {
  const { t, i18n } = useTranslation()
  const { status, serverNow, setStatus } = maintenance
  const messageId = useId()
  const startId = useId()
  const endId = useId()

  const isOn = status?.state === 'on'
  const hasWindow = status?.state === 'on' || status?.state === 'scheduled'

  const [message, setMessage] = useState('')
  const [startNow, setStartNow] = useState(true)
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const filledFrom = useRef<string | null>(null)

  // the form starts from the saved window, once per window, so a poll doesn't wipe what's being typed
  useEffect(() => {
    if (!status) return
    const key = hasWindow ? `${status.starts_at}|${status.ends_at}|${status.message}` : 'off'
    if (filledFrom.current === key) return
    filledFrom.current = key
    if (hasWindow && status.starts_at && status.ends_at) {
      setMessage(status.message ?? '')
      setStartNow(status.state === 'on')
      setStartAt(toLocalInput(parseServerDate(status.starts_at)))
      setEndAt(toLocalInput(parseServerDate(status.ends_at)))
    } else {
      setStartNow(true)
      setStartAt('')
      setEndAt('')
    }
  }, [status, hasWindow])

  const start = isOn || startNow ? new Date(serverNow()) : fromLocalInput(startAt)
  const end = fromLocalInput(endAt)
  const errors = {
    message: !message.trim() ? t('errors.required') : undefined,
    start: !isOn && !startNow && !start ? t('errors.required') : undefined,
    end: !end ? t('errors.required') : start && end.getTime() <= start.getTime() ? t('admin.maintenance.errorOrder') : undefined,
  }
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    setNotice('')
    if (errors.message || errors.start || errors.end || !end) return

    setBusy(true)
    try {
      const next = await scheduleMaintenance(
        message.trim(),
        isOn || startNow || !start ? null : start.toISOString(),
        end.toISOString(),
      )
      filledFrom.current = null
      setStatus(next)
      setSubmitted(false)
      setNotice(next.state === 'on' ? t('admin.maintenance.closedNotice') : t('admin.maintenance.scheduledNotice'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && String(err.detail).includes('30 days')) setError(t('admin.maintenance.errorLong'))
      else if (err instanceof ApiError && err.status === 400) setError(t('admin.maintenance.errorOrder'))
      else setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function onEnd() {
    setBusy(true)
    setError('')
    try {
      const wasOn = isOn
      setStatus(await endMaintenance())
      filledFrom.current = null
      setConfirmEnd(false)
      setMessage('')
      setNotice(wasOn ? t('admin.maintenance.openedNotice') : t('admin.maintenance.cancelledNotice'))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  function quickEnd(ms: number) {
    const base = start ?? new Date(serverNow())
    setEndAt(toLocalInput(new Date(base.getTime() + ms)))
  }

  let summary = t('admin.maintenance.stateOff')
  if (status?.state === 'scheduled' && status.starts_at && status.ends_at) {
    const startsAt = parseServerDate(status.starts_at)
    summary = t('admin.maintenance.stateScheduled', {
      from: formatDateTime(startsAt, i18n.language),
      to: formatDateTime(parseServerDate(status.ends_at), i18n.language),
      when: formatRelative(startsAt, i18n.language, new Date(serverNow())),
    })
  } else if (status?.state === 'on' && status.ends_at) {
    const endsAt = parseServerDate(status.ends_at)
    summary = t('admin.maintenance.stateOn', {
      to: formatDateTime(endsAt, i18n.language),
      when: formatRelative(endsAt, i18n.language, new Date(serverNow())),
    })
  }

  return (
    <section className="space-y-6">
      <div
        className={`rounded-2xl border p-4 ${isOn ? 'border-danger/50 bg-danger/5' : hasWindow ? 'border-accent/50 bg-accent/5' : 'border-line bg-card'}`}
      >
        <p className="font-medium">{status ? summary : t('feed.loading')}</p>
        {hasWindow && (
          <div className="mt-3">
            {confirmEnd ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">{isOn ? t('admin.maintenance.endConfirmText') : t('admin.maintenance.cancelConfirmText')}</p>
                <button type="button" onClick={() => setConfirmEnd(false)} className={secondaryButtonInline}>
                  {t('admin.cancel')}
                </button>
                <button type="button" onClick={onEnd} disabled={busy} className={dangerButtonInline}>
                  {isOn ? t('admin.maintenance.endNow') : t('admin.maintenance.cancelSchedule')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmEnd(true)} className={smallSecondaryButton}>
                {isOn ? t('admin.maintenance.endNow') : t('admin.maintenance.cancelSchedule')}
              </button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-serif text-xl font-semibold">
            {hasWindow ? t('admin.maintenance.editTitle') : t('admin.maintenance.newTitle')}
          </h2>

          <div>
            <label htmlFor={messageId} className="mb-1.5 block text-sm font-medium">
              {t('admin.maintenance.message')}
            </label>
            <textarea
              id={messageId}
              value={message}
              maxLength={MESSAGE_MAX}
              rows={4}
              dir="auto"
              placeholder={t('admin.maintenance.messagePlaceholder')}
              onChange={(e) => setMessage(e.target.value)}
              aria-invalid={show('message') ? true : undefined}
              aria-describedby={show('message') ? `${messageId}-err` : `${messageId}-hint`}
              className={`${controlClass} h-auto resize-y py-2.5 ${show('message') ? 'border-danger' : ''}`}
            />
            <FieldMessage
              id={messageId}
              error={show('message')}
              hint={t('settings.contact.counter', { count: message.length, max: MESSAGE_MAX })}
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('admin.maintenance.start')}</legend>
            {isOn ? (
              <p className="text-sm text-muted">
                {t('admin.maintenance.closedSince', {
                  time: status?.starts_at ? formatDateTime(parseServerDate(status.starts_at), i18n.language) : '',
                })}
              </p>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="start" checked={startNow} onChange={() => setStartNow(true)} className="accent-accent" />
                  {t('admin.maintenance.startNow')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="start" checked={!startNow} onChange={() => setStartNow(false)} className="accent-accent" />
                  {t('admin.maintenance.startLater')}
                </label>
                {!startNow && (
                  <div>
                    <label htmlFor={startId} className="sr-only">
                      {t('admin.maintenance.startLater')}
                    </label>
                    <input
                      id={startId}
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      aria-invalid={show('start') ? true : undefined}
                      className={`${controlClass} ${show('start') ? 'border-danger' : ''}`}
                    />
                    <FieldMessage id={startId} error={show('start')} />
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor={endId} className="mb-1.5 block text-sm font-medium">
              {t('admin.maintenance.end')}
            </label>
            <input
              id={endId}
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              aria-invalid={show('end') ? true : undefined}
              aria-describedby={show('end') ? `${endId}-err` : `${endId}-hint`}
              className={`${controlClass} ${show('end') ? 'border-danger' : ''}`}
            />
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('admin.maintenance.quick')}>
              {QUICK_ENDS.map((quick) => (
                <button key={quick.key} type="button" onClick={() => quickEnd(quick.ms)} className={smallSecondaryButton}>
                  {t(`admin.maintenance.quickEnds.${quick.key}`)}
                </button>
              ))}
            </div>
            <FieldMessage id={endId} error={show('end')} hint={t('admin.maintenance.endHint')} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={primaryButtonInline}>
            {busy
              ? t('auth.working')
              : hasWindow
                ? t('admin.maintenance.save')
                : startNow
                  ? t('admin.maintenance.closeNow')
                  : t('admin.maintenance.schedule')}
          </button>
        </form>

        <div className="space-y-2">
          <h2 className="font-serif text-xl font-semibold">{t('admin.maintenance.preview')}</h2>
          <div className="rounded-2xl border border-dashed border-line bg-bg px-4 py-8">
            <MaintenanceScreen
              message={message.trim() || t('admin.maintenance.messagePlaceholder')}
              endsAt={end ?? new Date(serverNow() + 60 * MINUTE)}
              serverNow={serverNow}
            />
          </div>
        </div>
      </div>

      <TestUserEntry enabled={hasWindow} />
    </section>
  )
}

// Test users can use the site while it's closed, but only when opened from here.
function TestUserEntry({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminUsers('', 0, { test: true })
      .then((page) => setUsers(page.items.filter((u) => u.is_active)))
      .catch(() => setUsers([]))
  }, [])

  async function open(user: AdminUser) {
    setError('')
    try {
      await openSiteAs(user.id)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-serif text-xl font-semibold">{t('admin.maintenance.testTitle')}</h2>
      <p className="text-sm text-muted">{enabled ? t('admin.maintenance.testExplain') : t('admin.maintenance.testOff')}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {users === null ? (
        <p className="text-sm text-muted">{t('feed.loading')}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.maintenance.noTestUsers')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {users.slice(0, ADMIN_USERS_PAGE).map((user) => (
            <li key={user.id}>
              <button type="button" disabled={!enabled} onClick={() => open(user)} className={`${smallSecondaryButton} disabled:opacity-50`}>
                {t('admin.maintenance.openAs', { username: user.username })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

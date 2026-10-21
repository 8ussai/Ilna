import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ADMIN_LOG_PAGE, fetchAdminLog } from '../../api/admin'
import type { AdminLogEntry } from '../../api/admin'
import { Select } from '../../components/Select'
import { secondaryButtonInline } from '../../components/styles'
import { formatDateTime, parseServerDate } from '../../lib/dates'

type Status = 'loading' | 'ready' | 'error'

// Everything the admin did, newest first, with what was recorded at the time (reasons, removed text, ...).
export function AdminLog() {
  const { t } = useTranslation()
  const [action, setAction] = useState('')
  const [items, setItems] = useState<AdminLogEntry[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAdminLog(action)
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setActions(page.actions)
        setTotal(page.total)
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [action])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchAdminLog(action, items.length)
      setItems((current) => [...current, ...page.items.filter((e) => !current.some((c) => c.id === e.id))])
      setTotal(page.total)
    } finally {
      setLoadingMore(false)
    }
  }

  const label = (a: string) => t(`admin.log.actions.${a}`, { defaultValue: a })
  const options = [{ value: '', label: t('admin.log.allActions') }, ...actions.map((a) => ({ value: a, label: label(a) }))]

  return (
    <section className="space-y-4">
      <div className="max-w-xs">
        <Select label={t('admin.log.filter')} value={action} options={options} onChange={(v) => (setStatus('loading'), setAction(v))} />
      </div>

      {status === 'loading' && <p className="py-10 text-center text-muted">{t('feed.loading')}</p>}
      {status === 'error' && (
        <p role="alert" className="py-10 text-center text-danger">
          {t('errors.generic')}
        </p>
      )}
      {status === 'ready' &&
        (items.length === 0 ? (
          <p className="py-10 text-center text-muted">{t('admin.log.none')}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {items.map((entry) => (
              <li key={entry.id}>
                <LogRow entry={entry} label={label(entry.action)} />
              </li>
            ))}
          </ul>
        ))}
      {status === 'ready' && items.length < total && (
        <div className="text-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryButtonInline}>
            {loadingMore ? t('feed.loading') : t('admin.users.loadMore', { count: Math.min(ADMIN_LOG_PAGE, total - items.length) })}
          </button>
        </div>
      )}
    </section>
  )
}

const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value))

function LogRow({ entry, label }: { entry: AdminLogEntry; label: string }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const d = entry.details

  // what it was done to: a student by username, or a post/reply by its #P/#R
  const target =
    entry.target_type === 'post'
      ? `#P${entry.target_id}`
      : entry.target_type === 'reply'
        ? `#R${entry.target_id}`
        : text(d.username || d.author)
          ? `@${text(d.username || d.author)}`
          : entry.target_type === 'user'
            ? `#${entry.target_id}`
            : ''
  // the one line worth reading without opening the details
  const summary = text(d.reason) || text(d.message) || text(d.content)

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{label}</span>
        {target && (
          <span dir="ltr" className="text-muted">
            {target}
          </span>
        )}
        {typeof d.recipients === 'number' && <span className="text-muted">· {t('admin.messages.sent', { count: d.recipients })}</span>}
        <span className="ms-auto text-muted">{formatDateTime(parseServerDate(entry.created_at), i18n.language)}</span>
      </div>
      {summary && (
        <p dir="auto" className="mt-1 line-clamp-2 break-words text-sm">
          {summary}
        </p>
      )}
      {Object.keys(d).length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 text-sm font-medium text-accent hover:underline">
            {open ? t('admin.log.hideDetails') : t('admin.log.showDetails')}
          </button>
          {open && (
            <pre dir="ltr" className="mt-2 max-h-80 overflow-auto rounded-lg bg-surface p-3 text-xs whitespace-pre-wrap break-words">
              {JSON.stringify(d, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

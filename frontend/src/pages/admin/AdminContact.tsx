import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ADMIN_CONTACT_PAGE, fetchAdminContact, markContactHandled } from '../../api/admin'
import type { AdminContactMessage, ContactFilter } from '../../api/admin'
import type { Catalog } from '../../api/meta'
import { postOriginNames } from '../../catalog'
import { secondaryButtonInline, smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { formatDateTime, parseServerDate } from '../../dates'

type Status = 'loading' | 'ready' | 'error'
const FILTERS: ContactFilter[] = ['open', 'handled', 'all']

// "Contact us" messages, newest first; onChanged lets the tab's badge catch up after marking one.
export function AdminContact({ catalog, onChanged }: { catalog: Catalog | null; onChanged: () => void }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ContactFilter>('open')
  const [items, setItems] = useState<AdminContactMessage[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAdminContact(filter)
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setTotal(page.total)
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [filter])

  function chooseFilter(next: ContactFilter) {
    setStatus('loading')
    setNotice('')
    setFilter(next)
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchAdminContact(filter, items.length)
      setItems((current) => [...current, ...page.items.filter((m) => !current.some((c) => c.id === m.id))])
      setTotal(page.total)
    } catch {
      setNotice(t('errors.generic'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function toggleHandled(message: AdminContactMessage) {
    setNotice('')
    try {
      const updated = await markContactHandled(message.id, !message.handled_at)
      // it no longer belongs in an Open or Handled list
      if (filter === 'all') setItems((current) => current.map((m) => (m.id === updated.id ? updated : m)))
      else {
        setItems((current) => current.filter((m) => m.id !== updated.id))
        setTotal((n) => n - 1)
      }
      onChanged()
    } catch {
      setNotice(t('errors.generic'))
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">{t('admin.contact.intro')}</p>
      <div role="group" aria-label={t('admin.contact.show')} className="flex w-fit rounded-lg border border-line p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => chooseFilter(f)}
            className={`h-9 rounded-md px-3 text-sm font-medium ${filter === f ? 'bg-surface' : 'text-muted hover:text-fg'}`}
          >
            {t(`admin.contact.filters.${f}`)}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      {status === 'loading' && <p className="py-10 text-center text-muted">{t('feed.loading')}</p>}
      {status === 'error' && (
        <p role="alert" className="py-10 text-center text-danger">
          {t('errors.generic')}
        </p>
      )}
      {status === 'ready' &&
        (items.length === 0 ? (
          <p className="py-10 text-center text-muted">{t(`admin.contact.none.${filter}`)}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((message) => (
              <li key={message.id}>
                <ContactCard message={message} catalog={catalog} onToggle={() => toggleHandled(message)} />
              </li>
            ))}
          </ul>
        ))}
      {status === 'ready' && items.length < total && (
        <div className="text-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryButtonInline}>
            {loadingMore ? t('feed.loading') : t('admin.users.loadMore', { count: Math.min(ADMIN_CONTACT_PAGE, total - items.length) })}
          </button>
        </div>
      )}
    </section>
  )
}

function ContactCard({ message, catalog, onToggle }: { message: AdminContactMessage; catalog: Catalog | null; onToggle: () => void }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const { sender } = message
  const names = postOriginNames(catalog, sender, i18n.language)
  const origin = [names.major, names.university].filter(Boolean).join(' · ')
  const replyLink = `mailto:${sender.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`

  return (
    <article className={`rounded-2xl border bg-card p-4 ${message.handled_at ? 'border-line' : 'border-accent/40'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 dir="auto" className="font-medium">
          {message.subject}
        </h3>
        <span className="text-sm text-muted">{formatDateTime(parseServerDate(message.created_at), i18n.language)}</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
        <span>
          {sender.first_name} {sender.last_name}
        </span>
        <span>·</span>
        <span dir="ltr">@{sender.username}</span>
        <span>·</span>
        <span dir="ltr">{sender.email}</span>
        {origin && <span>· {origin}</span>}
      </p>
      <p dir="auto" className="mt-3 whitespace-pre-wrap break-words">
        {message.message}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={replyLink} className={`${smallPrimaryButton} inline-flex items-center`}>
          {t('admin.contact.reply')}
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onToggle()
            setBusy(false)
          }}
          className={smallSecondaryButton}
        >
          {message.handled_at ? t('admin.contact.reopen') : t('admin.contact.markHandled')}
        </button>
        {message.handled_at && (
          <span className="text-sm text-muted">
            {t('admin.contact.handledAt', { date: formatDateTime(parseServerDate(message.handled_at), i18n.language) })}
          </span>
        )}
      </div>
    </article>
  )
}

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ADMIN_USERS_PAGE,
  banUser,
  deleteUser,
  fetchAdminUsers,
  resendUserCode,
  unbanUser,
  verifyUser,
} from '../../api/admin'
import type { AdminUser } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { Catalog } from '../../api/meta'
import { formatBytes } from '../../bytes'
import { postOriginNames } from '../../catalog'
import { Dialog } from '../../components/Dialog'
import { Field } from '../../components/Field'
import { dangerButtonInline, secondaryButtonInline, smallSecondaryButton } from '../../components/styles'
import { UserAvatar } from '../../components/UserAvatar'
import { formatDate, formatDateTime, parseServerDate } from '../../dates'

type Status = 'loading' | 'ready' | 'error'
type Action = { kind: 'ban' | 'delete'; user: AdminUser }

const SEARCH_DELAY_MS = 300

export function AdminUsers({ catalog }: { catalog: Catalog | null }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [notice, setNotice] = useState('')

  // waits for a pause in typing, then searches
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setStatus('loading')
      fetchAdminUsers(query.trim())
        .then((page) => {
          if (cancelled) return
          setUsers(page.items)
          setTotal(page.total)
          setStatus('ready')
        })
        .catch(() => !cancelled && setStatus('error'))
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchAdminUsers(query.trim(), users.length)
      setUsers((current) => [...current, ...page.items])
      setTotal(page.total)
    } catch {
      setNotice(t('errors.generic'))
    } finally {
      setLoadingMore(false)
    }
  }

  const replaceUser = (updated: AdminUser) => setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)))

  return (
    <section className="space-y-4">
      <Field
        label={t('admin.users.search')}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('admin.users.searchPlaceholder')}
        autoComplete="off"
      />

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
      {status === 'ready' && (
        <>
          <p className="text-sm text-muted">{t('admin.users.count', { count: total })}</p>
          {users.length === 0 ? (
            <p className="py-10 text-center text-muted">{t('admin.users.none')}</p>
          ) : (
            <ul className="space-y-3">
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  catalog={catalog}
                  onChange={replaceUser}
                  onAction={(kind) => setAction({ kind, user })}
                  onNotice={setNotice}
                />
              ))}
            </ul>
          )}
          {users.length < total && (
            <div className="text-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryButtonInline}>
                {loadingMore ? t('feed.loading') : t('admin.users.loadMore', { count: Math.min(ADMIN_USERS_PAGE, total - users.length) })}
              </button>
            </div>
          )}
        </>
      )}

      {action?.kind === 'ban' && (
        <BanDialog
          user={action.user}
          onClose={() => setAction(null)}
          onBanned={(updated) => {
            replaceUser(updated)
            setAction(null)
            setNotice(t('admin.users.bannedNotice', { username: updated.username }))
          }}
        />
      )}
      {action?.kind === 'delete' && (
        <DeleteDialog
          user={action.user}
          onClose={() => setAction(null)}
          onDeleted={() => {
            setUsers((current) => current.filter((u) => u.id !== action.user.id))
            setTotal((n) => n - 1)
            setAction(null)
            setNotice(t('admin.users.deletedNotice', { username: action.user.username }))
          }}
        />
      )}
    </section>
  )
}

function UserRow({
  user,
  catalog,
  onChange,
  onAction,
  onNotice,
}: {
  user: AdminUser
  catalog: Catalog | null
  onChange: (user: AdminUser) => void
  onAction: (kind: 'ban' | 'delete') => void
  onNotice: (text: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const origin = postOriginNames(catalog, user, i18n.language)
  const originText = [origin.major, origin.university].filter(Boolean).join(' · ')

  async function run(work: () => Promise<void>) {
    setBusy(true)
    onNotice('')
    try {
      await work()
    } catch (err) {
      onNotice(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const stats = [
    t('admin.users.posts', { count: user.posts_count }),
    t('admin.users.replies', { count: user.replies_count }),
    t('admin.users.courses', { count: user.courses_count }),
    formatBytes(user.storage_bytes, i18n.language),
  ].join(' · ')

  return (
    <li className={`rounded-2xl border bg-card p-4 ${user.is_banned ? 'border-danger/50' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <UserAvatar username={user.username} size={40} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">
              {user.first_name} {user.last_name}
            </span>
            <span className="text-sm text-muted">@{user.username}</span>
            {user.is_banned && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">{t('admin.users.banned')}</span>
            )}
            {!user.is_verified && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">{t('admin.users.unverified')}</span>
            )}
          </p>
          <p dir="ltr" className="truncate text-start text-sm text-muted">
            {user.email}
          </p>
          {originText && <p className="text-sm text-muted">{originText}</p>}
          <p className="text-sm text-muted">
            {t('admin.users.joined', { date: formatDate(parseServerDate(user.created_at), i18n.language) })} · {stats}
          </p>
          {user.is_banned && (
            <p className="pt-1 text-sm text-danger">
              {t('admin.users.bannedFor', { reason: user.banned_reason ?? '' })}
              {user.banned_at && ` (${formatDateTime(parseServerDate(user.banned_at), i18n.language)})`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {user.is_banned ? (
          <button type="button" disabled={busy} onClick={() => run(async () => onChange(await unbanUser(user.id)))} className={smallSecondaryButton}>
            {t('admin.users.unban')}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => onAction('ban')} className={`${smallSecondaryButton} text-danger`}>
            {t('admin.users.ban')}
          </button>
        )}
        {!user.is_verified && (
          <>
            <button type="button" disabled={busy} onClick={() => run(async () => onChange(await verifyUser(user.id)))} className={smallSecondaryButton}>
              {t('admin.users.verify')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await resendUserCode(user.id)
                  onNotice(t('admin.users.codeSent', { email: user.email }))
                })
              }
              className={smallSecondaryButton}
            >
              {t('admin.users.resendCode')}
            </button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => onAction('delete')} className={`${smallSecondaryButton} text-danger`}>
          {t('admin.users.delete')}
        </button>
      </div>
    </li>
  )
}

function BanDialog({ user, onClose, onBanned }: { user: AdminUser; onClose: () => void; onBanned: (user: AdminUser) => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reasonError = !reason.trim() ? t('errors.required') : reason.trim().length > 500 ? t('admin.users.reasonTooLong') : undefined

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    if (reasonError) return
    setBusy(true)
    try {
      onBanned(await banUser(user.id, reason.trim()))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('admin.users.banTitle', { username: user.username })} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-muted">{t('admin.users.banExplain')}</p>
        <div>
          <label htmlFor="ban-reason" className="mb-1.5 block text-sm font-medium">
            {t('admin.users.reason')}
          </label>
          <textarea
            id="ban-reason"
            dir="auto"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={submitted && reasonError ? true : undefined}
            className={`block w-full resize-y rounded-lg border bg-card px-3 py-2 text-fg placeholder:text-muted ${
              submitted && reasonError ? 'border-danger' : 'border-line'
            }`}
          />
          {submitted && reasonError && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {reasonError}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonInline}>
            {t('admin.cancel')}
          </button>
          <button type="submit" disabled={busy} className={dangerButtonInline}>
            {busy ? t('auth.working') : t('admin.users.banConfirm')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function DeleteDialog({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = typed.trim().toLowerCase() === user.username

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!matches) return
    setBusy(true)
    setError('')
    try {
      await deleteUser(user.id, typed.trim())
      onDeleted()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('admin.users.deleteTitle', { username: user.username })} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm">{t('admin.users.deleteExplain')}</p>
        <Field
          label={t('admin.users.deleteType', { username: user.username })}
          dir="ltr"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonInline}>
            {t('admin.cancel')}
          </button>
          <button type="submit" disabled={busy || !matches} className={dangerButtonInline}>
            {busy ? t('auth.working') : t('admin.users.deleteConfirm')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

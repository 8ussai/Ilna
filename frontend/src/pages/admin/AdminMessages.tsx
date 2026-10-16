import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchAdminUsers, previewMessage, sendMessage } from '../../api/admin'
import type { AdminUser, MessageAudience, MessageTarget } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { Catalog, Named } from '../../api/meta'
import { Field } from '../../components/Field'
import { Select } from '../../components/Select'
import { primaryButtonInline, smallSecondaryButton } from '../../components/styles'

// matches AdminMessageCreate in backend/schemas/admin.py
const MAX_MESSAGE = 2000
const TARGETS: MessageTarget[] = ['everyone', 'university', 'college', 'major', 'user']
const DELAY_MS = 300

// the audience as the server wants it, or null while a choice is still missing
function buildAudience(target: MessageTarget, university: string, college: string, major: string, userId: number | null): MessageAudience | null {
  if (target === 'everyone') return { target }
  if (target === 'user') return userId === null ? null : { target, user_id: userId }
  const value = { university, college, major }[target]
  return value ? { target, value } : null
}

// A message from Ilna Admin into students' notifications. The number of recipients is shown before
// sending, and the server refuses to send if that number changed in the meantime.
export function AdminMessages({ catalog }: { catalog: Catalog | null }) {
  const { t, i18n } = useTranslation()
  const nameOf = (n: Named) => (i18n.language === 'ar' ? n.name_ar : n.name_en)
  const toOptions = (items: Named[]) => items.map((n) => ({ value: n.id, label: nameOf(n) }))

  const [target, setTarget] = useState<MessageTarget>('everyone')
  const [university, setUniversity] = useState('')
  const [college, setCollege] = useState('')
  const [major, setMajor] = useState('')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [message, setMessage] = useState('')
  // the count for one audience; it only counts while that audience is still the chosen one
  const [counted, setCounted] = useState<{ key: string; count: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const universities = catalog?.countries.flatMap((c) => c.universities) ?? []
  const uni = universities.find((u) => u.id === university)
  const col = uni?.colleges.find((c) => c.id === college)

  const userId = user?.id ?? null
  const audience = buildAudience(target, university, college, major, userId)
  const audienceKey = JSON.stringify(audience)
  // null until the chosen audience is counted
  const count = counted?.key === audienceKey ? counted.count : null

  useEffect(() => {
    const current = buildAudience(target, university, college, major, userId)
    if (!current) return
    const key = JSON.stringify(current)
    let cancelled = false
    const timer = setTimeout(() => {
      previewMessage(current)
        .then((result) => !cancelled && setCounted({ key, count: result.count }))
        .catch(() => !cancelled && setError(t('errors.generic')))
    }, DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [target, university, college, major, userId, t])

  function chooseTarget(next: MessageTarget) {
    setTarget(next)
    setNotice('')
    setError('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setNotice('')
    setError('')
    if (!audience || !count || !message.trim()) return
    setBusy(true)
    try {
      const sent = await sendMessage(audience, message.trim(), count)
      setNotice(t('admin.messages.sent', { count: sent.count }))
      setMessage('')
    } catch (err) {
      const detail = err instanceof ApiError ? (err.detail as { code?: string; count?: number } | undefined) : undefined
      if (err instanceof ApiError && err.status === 409 && detail?.code === 'count_changed') {
        if (detail.count !== undefined) setCounted({ key: audienceKey, count: detail.count })
        setError(t('admin.messages.countChanged', { count: detail.count ?? 0 }))
      } else if (err instanceof ApiError && err.status === 0) setError(t('errors.network'))
      else setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const trimmedLength = message.trim().length

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
      <p className="text-sm text-muted">{t('admin.messages.intro')}</p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('admin.messages.to')}</legend>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                target === value ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name="message-target"
                value={value}
                checked={target === value}
                onChange={() => chooseTarget(value)}
                className="size-4 accent-[var(--accent)]"
              />
              {t(`admin.messages.targets.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {(target === 'university' || target === 'college' || target === 'major') && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label={t('admin.messages.university')}
            value={university}
            options={toOptions(universities)}
            onChange={(v) => (setUniversity(v), setCollege(''), setMajor(''))}
          />
          {target !== 'university' && (
            <Select
              label={t('admin.messages.college')}
              value={college}
              options={toOptions(uni?.colleges ?? [])}
              onChange={(v) => (setCollege(v), setMajor(''))}
              disabled={!uni}
            />
          )}
          {target === 'major' && (
            <Select label={t('admin.messages.major')} value={major} options={toOptions(col?.majors ?? [])} onChange={setMajor} disabled={!col} />
          )}
        </div>
      )}

      {target === 'user' && <UserPicker user={user} onPick={setUser} />}

      <div>
        <label htmlFor="admin-message" className="mb-1.5 block text-sm font-medium">
          {t('admin.messages.message')}
        </label>
        <textarea
          id="admin-message"
          dir="auto"
          rows={5}
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="block w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-fg placeholder:text-muted"
        />
        <p className="mt-1 text-end text-xs text-muted">
          {trimmedLength} / {MAX_MESSAGE}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" role="status">
        {!audience
          ? t('admin.messages.pickAudience')
          : count === null
            ? t('feed.loading')
            : count === 0
              ? t('admin.messages.nobody')
              : t('admin.messages.willReach', { count })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}

      <button type="submit" disabled={busy || !count || trimmedLength === 0} className={primaryButtonInline}>
        {busy ? t('auth.working') : count ? t('admin.messages.send', { count }) : t('admin.messages.sendPlain')}
      </button>
    </form>
  )
}

// search, then pick one student
function UserPicker({ user, onPick }: { user: AdminUser | null; onPick: (user: AdminUser | null) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminUser[]>([])

  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    const timer = setTimeout(() => {
      fetchAdminUsers(query.trim())
        .then((page) => !cancelled && setResults(page.items.slice(0, 6)))
        .catch(() => !cancelled && setResults([]))
    }, DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <span className="font-medium">
          {user.first_name} {user.last_name}
        </span>
        <span className="text-sm text-muted">@{user.username}</span>
        <button type="button" onClick={() => onPick(null)} className={`${smallSecondaryButton} ms-auto`}>
          {t('admin.messages.change')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <Field
        label={t('admin.messages.findUser')}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('admin.users.searchPlaceholder')}
        autoComplete="off"
      />
      {query.trim() && results.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {results.map((found) => (
            <li key={found.id}>
              <button type="button" onClick={() => onPick(found)} className="flex w-full items-center gap-2 px-4 py-2.5 text-start hover:bg-surface">
                <span className="font-medium">
                  {found.first_name} {found.last_name}
                </span>
                <span className="text-sm text-muted">@{found.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

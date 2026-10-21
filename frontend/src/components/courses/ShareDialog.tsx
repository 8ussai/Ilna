import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  addShare,
  fetchAccessLoss,
  fetchSharing,
  removeShare,
  renewShareCode,
  setCoursePublic,
} from '../../api/courseSharing'
import type { ShareTargetType, Sharing } from '../../api/courseSharing'
import { searchUsers } from '../../api/friends'
import type { PublicProfile } from '../../api/friends'
import { Dialog } from '../Dialog'
import { UserName } from '../Premium'
import { smallPrimaryButton, smallSecondaryButton } from '../styles'
import { UserAvatar } from '../UserAvatar'

const GROUPS: Exclude<ShareTargetType, 'user'>[] = ['university', 'college', 'major', 'friends']
const SEARCH_DELAY_MS = 300

// a change that takes the course away from people who added it, waiting for the owner to confirm
type Pending = { message: string; run: () => Promise<Sharing> }

// The owner's sharing settings: the course ID, public or private, and who a private course is shared with.
export function ShareDialog({ courseId, onClose, onChanged }: { courseId: number; onClose: () => void; onChanged: (sharing: Sharing) => void }) {
  const { t } = useTranslation()
  const [sharing, setSharing] = useState<Sharing | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [copied, setCopied] = useState(false)
  const [renewing, setRenewing] = useState(false)

  useEffect(() => {
    fetchSharing(courseId)
      .then(setSharing)
      .catch(() => setFailed(true))
  }, [courseId])

  async function apply(run: () => Promise<Sharing>) {
    setBusy(true)
    setError('')
    try {
      const next = await run()
      setSharing(next)
      onChanged(next)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  // asks first when people who added the course would lose it
  async function applyWithCheck(change: { makePrivate: true } | { removeShare: number }, run: () => Promise<Sharing>) {
    setBusy(true)
    setError('')
    try {
      const { members_losing: losing } = await fetchAccessLoss(courseId, change)
      setBusy(false)
      if (losing > 0) {
        setPending({ message: t('courses.share.losing', { count: losing }), run })
        return
      }
    } catch {
      setBusy(false)
      setError(t('errors.generic'))
      return
    }
    await apply(run)
  }

  async function copyCode() {
    if (!sharing) return
    try {
      await navigator.clipboard.writeText(sharing.share_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked; the code is on screen to copy by hand
    }
  }

  if (!sharing) {
    return (
      <Dialog title={t('courses.share.title')} onClose={onClose}>
        <p className="py-6 text-center text-muted" role="status">
          {failed ? t('errors.generic') : t('feed.loading')}
        </p>
      </Dialog>
    )
  }

  const groupShare = (type: ShareTargetType) => sharing.shares.find((s) => s.target_type === type)
  const people = sharing.shares.filter((s) => s.target_type === 'user' && s.user)

  return (
    <Dialog title={t('courses.share.title')} onClose={onClose} size="lg">
      <div className="space-y-6">
        {pending ? (
          <div role="alertdialog" aria-live="assertive" className="space-y-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
            <p className="text-sm">{pending.message}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} disabled={busy} className={smallSecondaryButton}>
                {t('feed.cancel')}
              </button>
              <button type="button" onClick={() => apply(pending.run)} disabled={busy} className={smallPrimaryButton}>
                {t('courses.share.continue')}
              </button>
            </div>
          </div>
        ) : null}

        <section>
          <h3 className="font-semibold">{t('courses.share.idTitle')}</h3>
          <p className="mt-1 text-sm text-muted">{t('courses.share.idHint')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code dir="ltr" className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-lg tracking-wider">
              {sharing.share_code}
            </code>
            <button type="button" onClick={copyCode} className={smallSecondaryButton}>
              {copied ? t('courses.share.copied') : t('courses.share.copy')}
            </button>
            {renewing ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">{t('courses.share.newIdConfirm')}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => apply(() => renewShareCode(courseId)).then(() => setRenewing(false))}
                  className="font-medium text-accent hover:underline"
                >
                  {t('feed.yes')}
                </button>
                <button type="button" onClick={() => setRenewing(false)} className="text-muted hover:underline">
                  {t('feed.cancel')}
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setRenewing(true)} className="text-sm text-muted hover:text-fg hover:underline">
                {t('courses.share.newId')}
              </button>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-semibold">{t('courses.share.visibility')}</h3>
          <div role="radiogroup" aria-label={t('courses.share.visibility')} className="mt-3 grid gap-2 sm:grid-cols-2">
            {([false, true] as const).map((isPublic) => {
              const selected = sharing.is_public === isPublic
              return (
                <button
                  key={String(isPublic)}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy || selected}
                  onClick={() =>
                    isPublic
                      ? apply(() => setCoursePublic(courseId, true))
                      : applyWithCheck({ makePrivate: true }, () => setCoursePublic(courseId, false))
                  }
                  className={`rounded-xl border p-3 text-start ${selected ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface'}`}
                >
                  <span className="block font-medium">{t(isPublic ? 'courses.share.public' : 'courses.share.private')}</span>
                  <span className="mt-0.5 block text-sm text-muted">{t(isPublic ? 'courses.share.publicHint' : 'courses.share.privateHint')}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-sm text-muted">{t('courses.share.members', { count: sharing.members_count })}</p>
        </section>

        <section>
          <h3 className="font-semibold">{t('courses.share.with')}</h3>
          <p className="mt-1 text-sm text-muted">{t('courses.share.withHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {GROUPS.map((type) => {
              const share = groupShare(type)
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={!!share}
                  disabled={busy}
                  onClick={() =>
                    share
                      ? applyWithCheck({ removeShare: share.id }, () => removeShare(courseId, share.id))
                      : apply(() => addShare(courseId, type))
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    share ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:bg-surface'
                  }`}
                >
                  {share ? '✓ ' : '+ '}
                  {t(`courses.share.group.${type}`)}
                </button>
              )
            })}
          </div>

          <PeoplePicker
            sharedIds={new Set(people.map((s) => s.user!.id))}
            disabled={busy}
            onShare={(profile) => apply(() => addShare(courseId, 'user', profile.id))}
          />

          {people.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {people.map((share) => (
                <li key={share.id} className="flex items-center gap-3 px-3 py-2">
                  <UserAvatar username={share.user!.username} size={32} />
                  <span className="min-w-0 flex-1 truncate">
                    <UserName user={share.user!} /> <span className="text-sm text-muted">@{share.user!.username}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => applyWithCheck({ removeShare: share.id }, () => removeShare(courseId, share.id))}
                    className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-danger"
                  >
                    {t('friends.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

// search for one person to share with, by name or @username (the Friends page's search)
function PeoplePicker({
  sharedIds,
  disabled,
  onShare,
}: {
  sharedIds: Set<number>
  disabled: boolean
  onShare: (profile: PublicProfile) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ query: string; people: PublicProfile[] } | null>(null)
  const trimmed = query.trim()

  useEffect(() => {
    if (!trimmed) return
    let ignore = false
    const timer = setTimeout(() => {
      searchUsers(trimmed)
        .then((people) => !ignore && setResults({ query: trimmed, people }))
        .catch(() => {})
    }, SEARCH_DELAY_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [trimmed])

  const showing = trimmed && results?.query === trimmed ? results.people : null

  return (
    <div className="mt-4">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t('courses.share.person')}
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('friends.searchPlaceholder')}
        autoComplete="off"
        maxLength={60}
        className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3 placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {showing && (
        <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {showing.length === 0 && <li className="px-3 py-3 text-sm text-muted">{t('friends.noResults')}</li>}
          {showing.map((profile) => {
            const shared = sharedIds.has(profile.id)
            return (
              <li key={profile.id} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar username={profile.username} size={32} />
                <span className="min-w-0 flex-1 truncate">
                  <UserName user={profile} /> <span className="text-sm text-muted">@{profile.username}</span>
                </span>
                <button
                  type="button"
                  disabled={disabled || shared}
                  onClick={() => onShare(profile)}
                  className={shared ? smallSecondaryButton : smallPrimaryButton}
                >
                  {shared ? t('courses.share.shared') : t('courses.share.shareButton')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

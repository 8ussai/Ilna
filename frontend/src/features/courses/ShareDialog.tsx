import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { applySharing, fetchAccessLoss, fetchSharing, renewShareCode } from '../../api/courseSharing'
import type { ShareGroup, Sharing, SharingDraft } from '../../api/courseSharing'
import type { CourseOwner } from '../../api/courses'
import { searchUsers } from '../../api/friends'
import type { PublicProfile } from '../../api/friends'
import { Dialog } from '../../components/Dialog'
import { UserName } from '../account/Premium'
import { primaryButtonInline, smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { UserAvatar } from '../../components/UserAvatar'

const GROUPS: ShareGroup[] = ['university', 'college', 'major', 'friends']
const SEARCH_DELAY_MS = 300

// what the dialog shows and changes; nothing is saved until Share is pressed
type Draft = { isPublic: boolean; notesDownloadable: boolean; groups: ShareGroup[]; people: CourseOwner[] }

// the saved settings, as a draft to edit
function draftFrom(sharing: Sharing): Draft {
  return {
    isPublic: sharing.is_public,
    notesDownloadable: sharing.notes_downloadable,
    groups: GROUPS.filter((g) => sharing.shares.some((s) => s.target_type === g)),
    people: sharing.shares.flatMap((s) => (s.target_type === 'user' && s.user ? [s.user] : [])),
  }
}

// the draft as the server takes it
function toRequest(draft: Draft): SharingDraft {
  return {
    is_public: draft.isPublic,
    notes_downloadable: draft.notesDownloadable,
    groups: draft.groups,
    user_ids: draft.people.map((p) => p.id),
  }
}

// whether the draft differs from what's saved
function changed(draft: Draft, saved: Draft) {
  const a = toRequest(draft)
  const b = toRequest(saved)
  return (
    a.is_public !== b.is_public ||
    a.notes_downloadable !== b.notes_downloadable ||
    [...a.groups].sort().join() !== [...b.groups].sort().join() ||
    [...a.user_ids].sort().join() !== [...b.user_ids].sort().join()
  )
}

// The owner's sharing settings: the course ID, public or private, who a private course is shared with,
// and whether people who add it can download its notes. Changes wait for the Share button, which saves
// them all and sends the course again to everyone it's shared with. A new course ID applies right away.
export function ShareDialog({ courseId, onClose, onChanged }: { courseId: number; onClose: () => void; onChanged: (sharing: Sharing) => void }) {
  const { t } = useTranslation()
  const [sharing, setSharing] = useState<Sharing | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // how many people would lose the course, waiting for the owner to confirm
  const [losing, setLosing] = useState<number | null>(null)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const downloadHintId = useId()

  useEffect(() => {
    fetchSharing(courseId)
      .then((s) => {
        setSharing(s)
        setDraft(draftFrom(s))
      })
      .catch(() => setFailed(true))
  }, [courseId])

  // changes the draft; a new change clears the "sent" note and any waiting warning
  function edit(change: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...change } : d))
    setSent(false)
    setLosing(null)
    setError('')
  }

  // saves the draft and sends the course again
  async function save() {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const next = await applySharing(courseId, toRequest(draft))
      setSharing(next)
      setDraft(draftFrom(next))
      onChanged(next)
      setSent(true)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
      setLosing(null)
    }
  }

  // the Share button: asks first when people who added the course would lose it
  async function share() {
    if (!draft) return
    setBusy(true)
    setError('')
    setSent(false)
    try {
      const { members_losing: count } = await fetchAccessLoss(courseId, toRequest(draft))
      if (count > 0) {
        setLosing(count)
        setBusy(false)
        return
      }
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
      return
    }
    await save()
  }

  // gives the course a new ID right away; the draft is kept
  async function renewCode() {
    setBusy(true)
    setError('')
    try {
      const next = await renewShareCode(courseId)
      setSharing(next)
      onChanged(next)
      setRenewing(false)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  // copies the course ID
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

  if (!sharing || !draft) {
    return (
      <Dialog title={t('courses.share.title')} onClose={onClose}>
        <p className="py-6 text-center text-muted" role="status">
          {failed ? t('errors.generic') : t('feed.loading')}
        </p>
      </Dialog>
    )
  }

  const unsaved = changed(draft, draftFrom(sharing))

  return (
    <Dialog title={t('courses.share.title')} onClose={onClose} size="lg">
      <div className="space-y-6">
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
                <button type="button" disabled={busy} onClick={renewCode} className="font-medium text-accent hover:underline">
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
              const selected = draft.isPublic === isPublic
              return (
                <button
                  key={String(isPublic)}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => edit({ isPublic })}
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
            {GROUPS.map((group) => {
              const on = draft.groups.includes(group)
              return (
                <button
                  key={group}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => edit({ groups: on ? draft.groups.filter((g) => g !== group) : [...draft.groups, group] })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    on ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:bg-surface'
                  }`}
                >
                  {on ? '✓ ' : '+ '}
                  {t(`courses.share.group.${group}`)}
                </button>
              )
            })}
          </div>

          <PeoplePicker
            addedIds={new Set(draft.people.map((p) => p.id))}
            disabled={busy}
            onAdd={(profile) => edit({ people: [...draft.people, profile] })}
          />

          {draft.people.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {draft.people.map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-3 py-2">
                  <UserAvatar username={person.username} size={32} />
                  <span className="min-w-0 flex-1 truncate">
                    <UserName user={person} /> <span className="text-sm text-muted">@{person.username}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => edit({ people: draft.people.filter((p) => p.id !== person.id) })}
                    className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-danger"
                  >
                    {t('friends.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold">{t('courses.share.notesTitle')}</h3>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-surface">
            <input
              type="checkbox"
              role="switch"
              checked={draft.notesDownloadable}
              disabled={busy}
              aria-describedby={downloadHintId}
              onChange={(e) => edit({ notesDownloadable: e.target.checked })}
              className="mt-1 size-4 shrink-0 accent-accent"
            />
            <span>
              <span className="block font-medium">{t('courses.share.notesDownload')}</span>
              <span id={downloadHintId} className="mt-0.5 block text-sm text-muted">
                {t('courses.share.notesDownloadHint')}
              </span>
            </span>
          </label>
        </section>

        <div className="space-y-3 border-t border-line pt-4">
          {losing !== null ? (
            <div role="alertdialog" aria-live="assertive" className="space-y-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
              <p className="text-sm">{t('courses.share.losing', { count: losing })}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setLosing(null)} disabled={busy} className={smallSecondaryButton}>
                  {t('feed.cancel')}
                </button>
                <button type="button" onClick={save} disabled={busy} className={smallPrimaryButton}>
                  {t('courses.share.continue')}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('courses.share.applyHint')}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="me-auto text-sm" role="status">
              {sent ? <span className="text-accent">{t('courses.share.sent')}</span> : unsaved ? <span className="text-muted">{t('courses.share.unsaved')}</span> : null}
            </p>
            <button type="button" onClick={share} disabled={busy || losing !== null} className={primaryButtonInline}>
              {busy ? t('auth.working') : t('courses.share.shareButton')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// search for one person to add to the draft, by name or @username (the Friends page's search)
function PeoplePicker({
  addedIds,
  disabled,
  onAdd,
}: {
  addedIds: Set<number>
  disabled: boolean
  onAdd: (profile: PublicProfile) => void
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
            const added = addedIds.has(profile.id)
            return (
              <li key={profile.id} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar username={profile.username} size={32} />
                <span className="min-w-0 flex-1 truncate">
                  <UserName user={profile} /> <span className="text-sm text-muted">@{profile.username}</span>
                </span>
                <button
                  type="button"
                  disabled={disabled || added}
                  onClick={() => onAdd(profile)}
                  className={added ? smallSecondaryButton : smallPrimaryButton}
                >
                  {added ? t('courses.share.added') : t('courses.share.addPerson')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

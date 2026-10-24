import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { fetchProfile } from '../../api/friends'
import type { PublicProfile } from '../../api/friends'
import type { Catalog } from '../../api/meta'
import { postOriginNames } from '../../lib/catalog'
import { useFriends } from './friendsContext'
import { useReadOnly } from '../../lib/readOnly'
import { Dialog } from '../../components/Dialog'
import { goldClass, UserName } from '../account/Premium'
import { smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { UserAvatar } from '../../components/UserAvatar'
import { ProfileCourses } from '../courses/SharedCourses'

// next to a friend's name; never on anonymous posts, whose authors the page doesn't know
export function FriendStar({ userId }: { userId: number }) {
  const { t } = useTranslation()
  const { isFriend } = useFriends()
  if (!isFriend(userId)) return null
  return (
    <span role="img" aria-label={t('friends.star')} title={t('friends.star')} className="ms-1 text-accent">
      ★
    </span>
  )
}

// Add or Remove; Remove asks first. Full lists can still remove. Test accounts can't add anyone.
export function FriendButton({ profile }: { profile: PublicProfile }) {
  const { t } = useTranslation()
  const readOnly = useReadOnly()
  const { isFriend, add, remove, count, limit } = useFriends()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const friend = isFriend(profile.id)
  const full = !friend && count >= limit

  if (readOnly) return null

  // adds or removes the friend
  async function toggle() {
    setBusy(true)
    setError('')
    try {
      if (friend) await remove(profile.id)
      else await add(profile)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? t('friends.full', { limit }) : t('errors.generic'))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  if (friend && confirming) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="flex flex-wrap items-center justify-end gap-1 text-sm">
          <span className="text-muted">{t('friends.confirmRemove', { name: profile.first_name })}</span>
          <button
            type="button"
            disabled={busy}
            onClick={toggle}
            className="rounded-md px-2 py-1 font-medium text-danger hover:bg-surface disabled:opacity-50"
          >
            {t('feed.yes')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-1 text-muted hover:bg-surface disabled:opacity-50"
          >
            {t('feed.cancel')}
          </button>
        </span>
        {error && (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={friend ? () => setConfirming(true) : toggle}
        disabled={busy || full}
        title={full ? t('friends.full', { limit }) : undefined}
        className={friend ? smallSecondaryButton : smallPrimaryButton}
      >
        {friend ? t('friends.remove') : t('friends.add')}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  )
}

// name, @username and where they study, as on a post. In a list each line is cut to fit;
// full (the profile card) wraps instead and shows university, college and major on their own lines.
export function ProfileSummary({ profile, catalog, full = false }: { profile: PublicProfile; catalog: Catalog | null; full?: boolean }) {
  const { i18n } = useTranslation()
  const origin = postOriginNames(catalog, profile, i18n.language)
  if (full) {
    return (
      <div className="min-w-0 flex-1 break-words">
        <p className="font-medium">
          <UserName user={profile} />
          <FriendStar userId={profile.id} />
        </p>
        <p dir="ltr" className={`text-sm ${profile.is_premium ? goldClass : 'text-muted'} rtl:text-end`}>
          @{profile.username}
        </p>
        {[origin.university, origin.college, origin.major].filter(Boolean).map((line) => (
          <p key={line} className="text-sm text-muted">
            {line}
          </p>
        ))}
      </div>
    )
  }
  const originText = [origin.major, origin.university].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">
        <UserName user={profile} />
        <FriendStar userId={profile.id} />
      </p>
      <p dir="ltr" className={`truncate text-sm ${profile.is_premium ? goldClass : 'text-muted'} rtl:text-end`}>
        @{profile.username}
      </p>
      {originText && <p className="truncate text-sm text-muted">{originText}</p>}
    </div>
  )
}

// The card opened by clicking a post or reply author.
export function ProfileDialog({ username, catalog, onClose }: { username: string; catalog: Catalog | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { count, limit } = useFriends()
  const readOnly = useReadOnly()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let ignore = false
    fetchProfile(username)
      .then((p) => !ignore && setProfile(p))
      .catch(() => !ignore && setFailed(true))
    return () => {
      ignore = true
    }
  }, [username])

  return (
    <Dialog title={t('friends.profile')} onClose={onClose} centered>
      {profile ? (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <UserAvatar username={profile.username} size={64} />
            <ProfileSummary profile={profile} catalog={catalog} full />
          </div>
          {!readOnly && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-sm text-muted">{t('friends.counter', { count, limit })}</span>
              <FriendButton profile={profile} />
            </div>
          )}
          <ProfileCourses username={profile.username} />
        </div>
      ) : (
        <p className="py-6 text-center text-muted" role="status">
          {failed ? t('friends.notFound') : t('feed.loading')}
        </p>
      )}
    </Dialog>
  )
}

// Makes an author's avatar or name open their profile card. Off for anonymous authors and the
// admin account, which have no card. The avatar copy skips the tab order so keyboard users stop once.
export function ProfileLink({
  username,
  enabled,
  tabStop = true,
  className = '',
  children,
}: {
  username: string
  enabled: boolean
  tabStop?: boolean
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { openProfile } = useFriends()
  if (!enabled) return <>{children}</>
  return (
    <button
      type="button"
      onClick={() => openProfile(username)}
      tabIndex={tabStop ? undefined : -1}
      aria-hidden={tabStop ? undefined : true}
      title={t('friends.openProfile')}
      className={`min-w-0 text-start hover:underline ${className}`}
    >
      {children}
    </button>
  )
}

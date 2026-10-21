import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { fetchProfile } from '../api/friends'
import type { PublicProfile } from '../api/friends'
import type { Catalog } from '../api/meta'
import { postOriginNames } from '../catalog'
import { useFriends } from '../friends'
import { useReadOnly } from '../readOnly'
import { Dialog } from './Dialog'
import { goldClass, UserName } from './Premium'
import { smallPrimaryButton, smallSecondaryButton } from './styles'
import { UserAvatar } from './UserAvatar'

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

// Add or Remove; full lists can still remove. Test accounts can't add anyone.
export function FriendButton({ profile }: { profile: PublicProfile }) {
  const { t } = useTranslation()
  const readOnly = useReadOnly()
  const { isFriend, add, remove, count, limit } = useFriends()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const friend = isFriend(profile.id)
  const full = !friend && count >= limit

  if (readOnly) return null

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
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
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

// name, @username and where they study, as on a post
export function ProfileSummary({ profile, catalog }: { profile: PublicProfile; catalog: Catalog | null }) {
  const { i18n } = useTranslation()
  const origin = postOriginNames(catalog, profile, i18n.language)
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
    <Dialog title={t('friends.profile')} onClose={onClose}>
      {profile ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar username={profile.username} size={64} />
            <ProfileSummary profile={profile} catalog={catalog} />
          </div>
          {!readOnly && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-sm text-muted">{t('friends.counter', { count, limit })}</span>
              <FriendButton profile={profile} />
            </div>
          )}
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

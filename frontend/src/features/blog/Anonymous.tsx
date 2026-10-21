import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Author } from '../../api/posts'
import { anonymousName, isAnonymousAuthor } from './anonymousAuthor'
import { FriendStar } from '../friends/Friends'
import { UserName } from '../account/Premium'
import { UserAvatar } from '../../components/UserAvatar'

// the same plain avatar for every anonymous author, so it can't be told apart or traced
function AnonymousAvatar({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-surface text-muted ring-1 ring-line"
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.6, height: size * 0.6 }} fill="currentColor">
        <circle cx="12" cy="8.5" r="4" />
        <path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" />
      </svg>
    </span>
  )
}

export function AuthorAvatar({ author, size }: { author: Author; size: number }) {
  return isAnonymousAuthor(author) ? <AnonymousAvatar size={size} /> : <UserAvatar username={author.username} size={size} />
}

// "Anonymous", "Author" or "Anonymous 2", or the name with its premium styling
export function AuthorName({ author, className = '' }: { author: Author; className?: string }) {
  const { t } = useTranslation()
  if (isAnonymousAuthor(author)) {
    return <span className={className}>{anonymousName(t, author)}</span>
  }
  return (
    <>
      <UserName user={author} className={className} />
      <FriendStar userId={author.id} />
    </>
  )
}

// on the writer's own anonymous post or reply; nobody else gets is_mine
export function OwnAnonymousTag() {
  const { t } = useTranslation()
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted" title={t('anonymous.onlyYouHint')}>
      {t('anonymous.onlyYou')}
    </span>
  )
}

// The one switch between anonymous and named after posting; asks first, since it can't be undone.
export function AnonymitySwitchButton({ isAnonymous, onSwitch }: { isAnonymous: boolean; onSwitch: () => Promise<void> }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onSwitch()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
      >
        {isAnonymous ? t('anonymous.showName') : t('anonymous.makeAnonymous')}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="text-muted">{isAnonymous ? t('anonymous.confirmShowName') : t('anonymous.confirmMakeAnonymous')}</span>
      <button
        type="button"
        disabled={busy}
        onClick={confirm}
        className="rounded-md px-2 py-1 font-medium text-accent hover:bg-surface disabled:opacity-50"
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
    </div>
  )
}

// the admin panel shows the real author with this next to it
export function AnonymousBadge({ shownAs }: { shownAs: Author }) {
  const { t } = useTranslation()
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line">
      {t('anonymous.postedAs', { name: anonymousName(t, shownAs) })}
    </span>
  )
}

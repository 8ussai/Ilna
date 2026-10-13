import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchNotifications, markNotificationsRead, NOTIFICATIONS_PAGE_SIZE } from '../api/me'
import type { AppNotification } from '../api/me'
import { secondaryButton } from '../components/styles'
import { UserAvatar } from '../components/UserAvatar'
import { formatDateTime, parseServerDate } from '../dates'
import { inAppClick } from '../links'
import { postPath } from '../tabs'

type Status = 'loading' | 'ready' | 'error'

type NotificationsPageProps = {
  onOpenPost: (postId: number, replyId: number | null) => void
  // called with how many notifications were just marked read, so the badge can drop right away
  onMarkedRead: (count: number) => void
}

function messageKey(n: AppNotification) {
  switch (n.type) {
    case 'post_vote':
      return n.vote_dir === -1 ? 'postDownvote' : 'postUpvote'
    case 'reply_vote':
      return n.vote_dir === -1 ? 'replyDownvote' : 'replyUpvote'
    case 'post_reply':
      return 'postReply'
    case 'reply_reply':
      return 'replyReply'
  }
}

// Every vote and reply on the user's posts and replies, newest first. Opening the page marks what it
// shows as read, but those items keep their unread look until the user leaves so they can spot what's new.
export function NotificationsPage({ onOpenPost, onMarkedRead }: NotificationsPageProps) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<AppNotification[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // only the ones actually shown, so a notification arriving meanwhile stays unread
  const markRead = useCallback(
    (page: AppNotification[]) => {
      const unread = page.filter((n) => !n.is_read).map((n) => n.id)
      if (unread.length === 0) return
      markNotificationsRead(unread)
        .then(() => onMarkedRead(unread.length))
        // they stay unread and will be marked next time
        .catch(() => {})
    },
    [onMarkedRead],
  )

  const load = useCallback(() => {
    fetchNotifications()
      .then((page) => {
        setItems(page)
        setHasMore(page.length === NOTIFICATIONS_PAGE_SIZE)
        setStatus('ready')
        markRead(page)
      })
      .catch(() => setStatus('error'))
  }, [markRead])

  useEffect(load, [load])

  function retry() {
    setStatus('loading')
    load()
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchNotifications(items.length)
      const fresh = page.filter((p) => !items.some((c) => c.id === p.id))
      setItems((current) => [...current, ...fresh])
      setHasMore(page.length === NOTIFICATIONS_PAGE_SIZE)
      markRead(fresh)
    } catch {
      // keep the button so the user can try again
    } finally {
      setLoadingMore(false)
    }
  }

  let content
  if (status === 'loading') {
    content = (
      <p className="py-10 text-center text-muted" role="status">
        {t('feed.loading')}
      </p>
    )
  } else if (status === 'error') {
    content = (
      <div className="py-10 text-center">
        <p className="text-muted">{t('settings.notifications.loadFailed')}</p>
        <button type="button" onClick={retry} className={`${secondaryButton} mt-4 w-auto`}>
          {t('auth.retry')}
        </button>
      </div>
    )
  } else if (items.length === 0) {
    content = <p className="py-10 text-center text-muted">{t('settings.notifications.empty')}</p>
  } else {
    content = (
      <>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {items.map((n) => {
            const created = parseServerDate(n.created_at)
            const name = `${n.actor.first_name} ${n.actor.last_name}`
            return (
              <li key={n.id}>
                <a
                  href={postPath(n.post_id, n.reply_id)}
                  onClick={inAppClick(() => onOpenPost(n.post_id, n.reply_id))}
                  className={`flex gap-3 px-5 py-4 hover:bg-surface ${n.is_read ? '' : 'bg-accent/5'}`}
                >
                  <UserAvatar username={n.actor.username} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {!n.is_read && <span className="sr-only">{t('settings.notifications.unread')}: </span>}
                      {t(`settings.notifications.${messageKey(n)}`, { name })}
                    </span>
                    <span dir="auto" className="mt-1 line-clamp-2 block break-words text-sm text-muted">
                      {n.preview}
                    </span>
                    <time dateTime={created.toISOString()} className="mt-1 block text-xs text-muted">
                      {formatDateTime(created, i18n.language)}
                    </time>
                  </span>
                  {!n.is_read && <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" />}
                </a>
              </li>
            )
          })}
        </ul>
        {hasMore && (
          <div className="mt-4 text-center">
            <button type="button" onClick={loadMore} disabled={loadingMore} className={`${secondaryButton} w-auto`}>
              {loadingMore ? t('feed.loading') : t('feed.loadMore')}
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">{t('settings.notifications.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.notifications.description')}</p>
      <div className="mt-6">{content}</div>
    </>
  )
}

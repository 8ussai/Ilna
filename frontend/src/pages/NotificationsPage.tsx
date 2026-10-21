import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchNotifications, markNotificationsRead, NOTIFICATIONS_PAGE_SIZE } from '../api/me'
import type { AppNotification } from '../api/me'
import { AuthorAvatar, AuthorName } from '../components/Anonymous'
import { secondaryButton } from '../components/styles'
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
    case 'post_removed':
      return 'postRemoved'
    case 'reply_removed':
      return 'replyRemoved'
    case 'admin_message':
      return 'adminMessage'
    case 'premium_granted':
      return 'premiumGranted'
  }
}

// stands in for the name in the translated sentence, so the name can be put back styled (gold for premium)
const NAME_MARK = '\u0001'

function withName(text: string, actor: AppNotification['actor']) {
  const at = text.indexOf(NAME_MARK)
  if (at === -1) return text
  return (
    <>
      {text.slice(0, at)}
      <AuthorName author={actor} />
      {text.slice(at + NAME_MARK.length)}
    </>
  )
}

// an admin message longer than this (or with line breaks) folds, with a button to show it all
const FOLD_CHARS = 160
const folds = (n: AppNotification) => n.type === 'admin_message' && (n.preview.length > FOLD_CHARS || n.preview.includes('\n'))

// Every vote and reply on the user's posts and replies, newest first. Opening the page marks what it
// shows as read, but those items keep their unread look until the user leaves so they can spot what's new.
export function NotificationsPage({ onOpenPost, onMarkedRead }: NotificationsPageProps) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<AppNotification[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // admin messages opened in full
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

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
            const body = (
              <>
                <AuthorAvatar author={n.actor} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {!n.is_read && <span className="sr-only">{t('settings.notifications.unread')}: </span>}
                    {withName(t(`settings.notifications.${messageKey(n)}`, { name: NAME_MARK, ref: n.ref ?? '' }), n.actor)}
                    {n.actor_is_admin && (
                      <span className="ms-2 rounded-full bg-accent/15 px-2 py-0.5 align-middle text-xs font-medium text-accent">
                        {t('settings.notifications.adminBadge')}
                      </span>
                    )}
                  </span>
                  {n.reason && (
                    <span dir="auto" className="mt-1 block text-sm">
                      {t('settings.notifications.reason', { reason: n.reason })}
                    </span>
                  )}
                  {n.type === 'admin_message' ? (
                    <span
                      dir="auto"
                      className={`mt-1 block whitespace-pre-wrap break-words ${expanded.has(n.id) ? '' : 'line-clamp-3'}`}
                    >
                      {n.preview}
                    </span>
                  ) : (
                    <span dir="auto" className="mt-1 line-clamp-2 block break-words text-sm text-muted">
                      {n.preview}
                    </span>
                  )}
                  {folds(n) && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current)
                          if (next.has(n.id)) next.delete(n.id)
                          else next.add(n.id)
                          return next
                        })
                      }
                      aria-expanded={expanded.has(n.id)}
                      className="mt-1 text-sm font-medium text-accent hover:underline"
                    >
                      {expanded.has(n.id) ? t('settings.notifications.showLess') : t('settings.notifications.showAll')}
                    </button>
                  )}
                  <time dateTime={created.toISOString()} className="mt-1 block text-xs text-muted">
                    {formatDateTime(created, i18n.language)}
                  </time>
                </span>
                {!n.is_read && <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" />}
              </>
            )
            const rowClass = `flex gap-3 px-5 py-4 ${n.is_read ? '' : 'bg-accent/5'}`
            const postId = n.post_id
            return (
              <li key={n.id}>
                {/* a removed post has nothing to open */}
                {postId === null ? (
                  <div className={rowClass}>{body}</div>
                ) : (
                  <a
                    href={postPath(postId, n.reply_id)}
                    onClick={inAppClick(() => onOpenPost(postId, n.reply_id))}
                    className={`${rowClass} hover:bg-surface`}
                  >
                    {body}
                  </a>
                )}
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

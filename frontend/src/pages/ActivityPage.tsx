import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Me } from '../api/auth'
import { ACTIVITY_PAGE_SIZE, fetchActivity } from '../api/me'
import type { ActivityItem } from '../api/me'
import type { Catalog } from '../api/meta'
import { catalogNames } from '../catalog'
import { secondaryButton } from '../components/styles'
import { formatDateTime, parseServerDate } from '../dates'
import { inAppClick } from '../links'
import { postPath } from '../tabs'

type Status = 'loading' | 'ready' | 'error'

type ActivityPageProps = {
  me: Me
  catalog: Catalog | null
  onOpenPost: (postId: number, replyId: number | null) => void
}

// The user's own posts and replies, newest first; each opens the post (scrolled to the reply).
export function ActivityPage({ me, catalog, onOpenPost }: ActivityPageProps) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(() => {
    fetchActivity()
      .then((page) => {
        setItems(page)
        setHasMore(page.length === ACTIVITY_PAGE_SIZE)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(load, [load])

  function retry() {
    setStatus('loading')
    load()
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchActivity(items.length)
      setItems((current) => [...current, ...page.filter((p) => !current.some((c) => c.type === p.type && c.id === p.id))])
      setHasMore(page.length === ACTIVITY_PAGE_SIZE)
    } catch {
      // keep the button so the user can try again
    } finally {
      setLoadingMore(false)
    }
  }

  // own posts are always in the user's own groups, so their names come from the user's catalog entries
  const names = catalogNames(catalog, me, i18n.language)
  const blogName = (scope: ActivityItem['scope']) =>
    scope === 'general' ? t('tabs.general') : (names[scope] ?? t(`tabs.${scope}`))

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
        <p className="text-muted">{t('settings.activity.loadFailed')}</p>
        <button type="button" onClick={retry} className={`${secondaryButton} mt-4 w-auto`}>
          {t('auth.retry')}
        </button>
      </div>
    )
  } else if (items.length === 0) {
    content = <p className="py-10 text-center text-muted">{t('settings.activity.empty')}</p>
  } else {
    content = (
      <>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {items.map((item) => {
            const replyId = item.type === 'reply' ? item.id : null
            const created = parseServerDate(item.created_at)
            return (
              <li key={`${item.type}-${item.id}`}>
                <a
                  href={postPath(item.post_id, replyId)}
                  onClick={inAppClick(() => onOpenPost(item.post_id, replyId))}
                  className="block px-5 py-4 hover:bg-surface"
                >
                  <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                    <span className="font-medium text-fg">
                      {t(item.type === 'post' ? 'settings.activity.posted' : 'settings.activity.replied', {
                        blog: blogName(item.scope),
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={created.toISOString()}>{formatDateTime(created, i18n.language)}</time>
                  </span>
                  <span dir="auto" className="mt-1.5 line-clamp-3 block whitespace-pre-wrap break-words">
                    {item.content}
                  </span>
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
      <h1 className="mt-3 font-serif text-3xl font-semibold">{t('settings.activity.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.activity.description')}</p>
      <div className="mt-6">{content}</div>
    </>
  )
}

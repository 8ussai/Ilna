import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { deletePost, fetchPosts, PAGE_SIZE } from '../api/posts'
import type { Post, PostScope } from '../api/posts'
import { PostCard } from './PostCard'
import { PostComposer } from './PostComposer'
import { secondaryButton } from './styles'

type Status = 'loading' | 'ready' | 'error'

// One blog: General is shared by everyone, the others only hold posts from the user's own university/college/major.
export function BlogFeed({ scope, title, userId }: { scope: PostScope; title: string; userId: number }) {
  const { t } = useTranslation()
  const [posts, setPosts] = useState<Post[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    fetchPosts(scope)
      .then((page) => {
        if (ignore) return
        setPosts(page)
        setHasMore(page.length === PAGE_SIZE)
        setStatus('ready')
      })
      .catch(() => {
        if (!ignore) setStatus('error')
      })
    return () => {
      ignore = true
    }
  }, [scope, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchPosts(scope, posts.length)
      // skip anything already shown (e.g. a post we just created shifted the offsets)
      setPosts((current) => [...current, ...page.filter((p) => !current.some((c) => c.id === p.id))])
      setHasMore(page.length === PAGE_SIZE)
    } catch {
      // keep the button so the user can try again
    } finally {
      setLoadingMore(false)
    }
  }

  async function remove(id: number) {
    try {
      await deletePost(id)
    } catch (err) {
      // already gone counts as deleted
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setPosts((current) => current.filter((p) => p.id !== id))
  }

  return (
    <section aria-labelledby="feed-title" className="space-y-4">
      <h1 id="feed-title" className="font-serif text-3xl font-semibold">
        {title}
      </h1>

      <PostComposer
        scope={scope}
        placeholder={t('feed.placeholder', { name: title })}
        onPosted={(post) => setPosts((current) => [post, ...current])}
      />

      {status === 'loading' && (
        <p className="py-10 text-center text-muted" role="status">
          {t('feed.loading')}
        </p>
      )}

      {status === 'error' && (
        <div className="py-10 text-center">
          <p className="text-muted">{t('feed.loadFailed')}</p>
          <button type="button" onClick={() => {
              setStatus('loading')
              setReloadKey((k) => k + 1)
            }} className={`${secondaryButton} mt-4 w-auto`}>
            {t('auth.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && posts.length === 0 && (
        <p className="py-10 text-center text-muted">{t('feed.empty')}</p>
      )}

      {status === 'ready' &&
        posts.map((post) => (
          <PostCard key={post.id} post={post} isOwn={post.user_id === userId} onDelete={() => remove(post.id)} />
        ))}

      {status === 'ready' && hasMore && (
        <div className="text-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className={`${secondaryButton} w-auto`}>
            {loadingMore ? t('feed.loading') : t('feed.loadMore')}
          </button>
        </div>
      )}
    </section>
  )
}

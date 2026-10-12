import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { createPost, deletePost, fetchPosts, PAGE_SIZE, votePost } from '../api/posts'
import type { Post, PostScope, PostSort } from '../api/posts'
import { applyVote } from '../votes'
import { Composer } from './Composer'
import { PostCard } from './PostCard'
import { secondaryButton } from './styles'

type Status = 'loading' | 'ready' | 'error'

const SORTS: PostSort[] = ['hot', 'new', 'top']

// One blog: General is shared by everyone, the others only hold posts from the user's own university/college/major.
export function BlogFeed({ scope, title, userId }: { scope: PostScope; title: string; userId: number }) {
  const { t } = useTranslation()
  const [sort, setSort] = useState<PostSort>('hot')
  const [posts, setPosts] = useState<Post[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    fetchPosts(scope, sort)
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
  }, [scope, sort, reloadKey])

  function reload(nextSort = sort) {
    setStatus('loading')
    setSort(nextSort)
    setReloadKey((k) => k + 1)
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchPosts(scope, sort, posts.length)
      // skip anything already shown (new posts and votes shift the offsets)
      setPosts((current) => [...current, ...page.filter((p) => !current.some((c) => c.id === p.id))])
      setHasMore(page.length === PAGE_SIZE)
    } catch {
      // keep the button so the user can try again
    } finally {
      setLoadingMore(false)
    }
  }

  function patchPost(id: number, changes: Partial<Post>) {
    setPosts((current) => current.map((p) => (p.id === id ? { ...p, ...changes } : p)))
  }

  // update the score right away, then settle on what the server says (or roll back)
  async function vote(post: Post, dir: 1 | -1) {
    patchPost(post.id, applyVote(post, dir))
    try {
      const result = await votePost(post.id, dir)
      patchPost(post.id, { my_vote: result.vote_dir, votes_count: result.votes_count })
    } catch (err) {
      patchPost(post.id, { my_vote: post.my_vote, votes_count: post.votes_count })
      throw err
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

      <Composer
        label={t('feed.composerLabel')}
        placeholder={t('feed.placeholder', { name: title })}
        submitLabel={t('feed.post')}
        onSubmit={async (content) => {
          const post = await createPost(scope, content)
          setPosts((current) => [post, ...current])
        }}
      />

      <div role="group" aria-label={t('feed.sortBy')} className="flex w-fit rounded-lg border border-line p-0.5">
        {SORTS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={sort === option}
            onClick={() => option !== sort && reload(option)}
            className={`h-8 rounded-md px-3 text-sm font-medium ${sort === option ? 'bg-surface' : 'text-muted hover:text-fg'}`}
          >
            {t(`feed.sort.${option}`)}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <p className="py-10 text-center text-muted" role="status">
          {t('feed.loading')}
        </p>
      )}

      {status === 'error' && (
        <div className="py-10 text-center">
          <p className="text-muted">{t('feed.loadFailed')}</p>
          <button type="button" onClick={() => reload()} className={`${secondaryButton} mt-4 w-auto`}>
            {t('auth.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && posts.length === 0 && (
        <p className="py-10 text-center text-muted">{t('feed.empty')}</p>
      )}

      {status === 'ready' &&
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            userId={userId}
            onDelete={() => remove(post.id)}
            onVote={(dir) => vote(post, dir)}
            onRepliesChange={(delta) =>
              setPosts((current) =>
                current.map((p) => (p.id === post.id ? { ...p, replies_count: p.replies_count + delta } : p)),
              )
            }
          />
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

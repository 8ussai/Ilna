import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import type { Catalog } from '../api/meta'
import { deletePost, fetchPost, votePost } from '../api/posts'
import type { Post } from '../api/posts'
import { PostCard } from '../components/PostCard'
import { secondaryButton } from '../components/styles'
import { applyVote } from '../votes'

// 'unavailable' covers a post that doesn't exist (anymore) or is outside the user's blogs
type Status = 'loading' | 'ready' | 'unavailable' | 'deleted' | 'error'

// One post with its thread open, reached from Activity (and later Notifications).
export function PostPage({
  postId,
  replyId,
  catalog,
}: {
  postId: number
  replyId: number | null
  catalog: Catalog | null
}) {
  const { t } = useTranslation()
  const [post, setPost] = useState<Post | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    fetchPost(postId)
      .then((loaded) => {
        if (ignore) return
        setPost(loaded)
        setStatus('ready')
      })
      .catch((err) => {
        if (ignore) return
        setStatus(err instanceof ApiError && (err.status === 404 || err.status === 403) ? 'unavailable' : 'error')
      })
    return () => {
      ignore = true
    }
  }, [postId, reloadKey])

  function patchPost(changes: Partial<Post>) {
    setPost((current) => (current ? { ...current, ...changes } : current))
  }

  // update the score right away, then settle on what the server says (or roll back)
  async function vote(current: Post, dir: 1 | -1) {
    patchPost(applyVote(current, dir))
    try {
      const result = await votePost(current.id, dir)
      patchPost({ my_vote: result.vote_dir, votes_count: result.votes_count })
    } catch (err) {
      patchPost({ my_vote: current.my_vote, votes_count: current.votes_count })
      throw err
    }
  }

  async function remove() {
    try {
      await deletePost(postId)
    } catch (err) {
      // already gone counts as deleted
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setStatus('deleted')
  }

  if (status === 'loading') {
    return (
      <p className="py-16 text-center text-muted" role="status">
        {t('feed.loading')}
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">{t('post.loadFailed')}</p>
        <button
          type="button"
          onClick={() => {
            setStatus('loading')
            setReloadKey((k) => k + 1)
          }}
          className={`${secondaryButton} mt-4 w-auto`}
        >
          {t('auth.retry')}
        </button>
      </div>
    )
  }

  if (status !== 'ready' || !post) {
    return <p className="py-16 text-center text-muted">{t(status === 'deleted' ? 'post.deleted' : 'post.unavailable')}</p>
  }

  return (
    <PostCard
      post={post}
      catalog={catalog}
      initialShowReplies
      highlightReplyId={replyId}
      onDelete={remove}
      onVote={(dir) => vote(post, dir)}
      onUpdated={setPost}
      onRepliesChange={(delta) =>
        setPost((current) => (current ? { ...current, replies_count: current.replies_count + delta } : current))
      }
    />
  )
}

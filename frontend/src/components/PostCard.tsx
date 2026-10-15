import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Catalog } from '../api/meta'
import type { Post } from '../api/posts'
import { postOriginNames } from '../catalog'
import { formatDateTime, parseServerDate } from '../dates'
import { DeleteButton } from './DeleteButton'
import { RepliesSection } from './Replies'
import { UserAvatar } from './UserAvatar'
import { VoteButtons } from './VoteButtons'

export function PostCard({
  post,
  userId,
  catalog,
  onDelete,
  onVote,
  onRepliesChange,
  initialShowReplies = false,
  highlightReplyId = null,
}: {
  post: Post
  userId: number
  catalog: Catalog | null
  // the single-post page opens the thread right away, optionally highlighting one reply
  initialShowReplies?: boolean
  highlightReplyId?: number | null
  onDelete: () => Promise<void>
  onVote: (dir: 1 | -1) => Promise<void>
  onRepliesChange: (delta: number) => void
}) {
  const { t, i18n } = useTranslation()
  const [voting, setVoting] = useState(false)
  const [showReplies, setShowReplies] = useState(initialShowReplies)
  const [error, setError] = useState('')

  async function vote(dir: 1 | -1) {
    setVoting(true)
    setError('')
    try {
      await onVote(dir)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setVoting(false)
    }
  }

  async function remove() {
    setError('')
    try {
      await onDelete()
    } catch {
      setError(t('errors.generic'))
    }
  }

  const { author } = post
  const created = parseServerDate(post.created_at)
  // a blog's readers already share its university/college/major, so show only what can differ
  const origin = postOriginNames(catalog, post, i18n.language)
  const originParts =
    post.scope === 'general' ? [origin.major, origin.university] : post.scope === 'major' ? [] : [origin.major]
  const originText = originParts.filter(Boolean).join(' · ')

  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <UserAvatar username={author.username} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {author.first_name} {author.last_name}
            <span className="ms-2 text-sm font-normal text-muted">@{author.username}</span>
          </p>
          {originText && <p className="truncate text-sm text-muted">{originText}</p>}
          <p className="text-sm text-muted">
            <time dateTime={created.toISOString()}>{formatDateTime(created, i18n.language)}</time>
            <span dir="ltr" className="ms-2">
              #P{post.id}
            </span>
          </p>
        </div>

        {post.user_id === userId && <DeleteButton question={t('feed.confirmDelete')} onConfirm={remove} />}
      </header>

      <p dir="auto" className="mt-3 whitespace-pre-wrap break-words">
        {post.content}
      </p>

      <div className="-ms-1.5 mt-3 flex items-center gap-2">
        <VoteButtons count={post.votes_count} myVote={post.my_vote} disabled={voting} onVote={vote} />
        <button
          type="button"
          onClick={() => setShowReplies((open) => !open)}
          aria-expanded={showReplies}
          className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-surface ${
            showReplies ? 'text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          {t('replies.count', { count: post.replies_count })}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {showReplies && (
        <RepliesSection postId={post.id} userId={userId} highlightId={highlightReplyId} onCountChange={onRepliesChange} />
      )}
    </article>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Catalog } from '../../api/meta'
import { fetchPostImage, setPostAnonymity } from '../../api/posts'
import type { Post } from '../../api/posts'
import { postOriginNames } from '../../lib/catalog'
import { formatDateTime, parseServerDate } from '../../lib/dates'
import { AnonymitySwitchButton, AuthorAvatar, AuthorName, OwnAnonymousTag } from './Anonymous'
import { DeleteButton } from '../../components/DeleteButton'
import { ProfileLink } from '../friends/Friends'
import { LinkifiedText } from './LinkifiedText'
import { PostImages } from './PostImages'
import { RepliesSection } from './Replies'
import { ReportButton } from './ReportButton'
import { goldClass } from '../account/Premium'
import { VoteButtons } from './VoteButtons'

export function PostCard({
  post,
  catalog,
  onDelete,
  onVote,
  onRepliesChange,
  onUpdated,
  initialShowReplies = false,
  highlightReplyId = null,
}: {
  post: Post
  catalog: Catalog | null
  // the single-post page opens the thread right away, optionally highlighting one reply
  initialShowReplies?: boolean
  highlightReplyId?: number | null
  onDelete: () => Promise<void>
  onVote: (dir: 1 | -1) => Promise<void>
  onRepliesChange: (delta: number) => void
  // the post as the server has it after the author's anonymity switch
  onUpdated: (post: Post) => void
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

  async function switchAnonymity() {
    setError('')
    try {
      onUpdated(await setPostAnonymity(post.id, !post.is_anonymous))
    } catch {
      setError(t('errors.generic'))
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
  // anonymous authors and the admin account have no profile card
  const hasProfile = !post.is_anonymous && !post.is_admin_post
  const created = parseServerDate(post.created_at)
  // a blog's readers already share its university/college/major, so show only what can differ
  const origin = postOriginNames(catalog, post, i18n.language)
  const originParts =
    post.scope === 'general' ? [origin.major, origin.university] : post.scope === 'major' ? [] : [origin.major]
  const originText = originParts.filter(Boolean).join(' · ')

  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <ProfileLink username={author.username} enabled={hasProfile} tabStop={false} className="shrink-0">
          <AuthorAvatar author={author} size={40} />
        </ProfileLink>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            <ProfileLink username={author.username} enabled={hasProfile}>
              <AuthorName author={author} />
            </ProfileLink>
            {!post.is_anonymous && (
              <span className={`ms-2 text-sm font-normal ${author.is_premium ? goldClass : 'text-muted'}`}>@{author.username}</span>
            )}
            {post.is_anonymous && post.is_mine && (
              <span className="ms-2 align-middle">
                <OwnAnonymousTag />
              </span>
            )}
            {post.is_admin_post && (
              <span className="ms-2 rounded-full bg-accent/15 px-2 py-0.5 align-middle text-xs font-medium text-accent">
                {t('settings.notifications.adminBadge')}
              </span>
            )}
          </p>
          {originText && <p className="truncate text-sm text-muted">{originText}</p>}
          <p className="text-sm text-muted">
            <time dateTime={created.toISOString()}>{formatDateTime(created, i18n.language)}</time>
            <span dir="ltr" className="ms-2">
              #P{post.id}
            </span>
          </p>
        </div>

        {post.is_pinned && (
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">📌 {t('feed.pinned')}</span>
        )}
        {post.is_mine && <DeleteButton question={t('feed.confirmDelete')} onConfirm={remove} />}
      </header>

      <p dir="auto" className="mt-3 whitespace-pre-wrap break-words">
        <LinkifiedText text={post.content} />
      </p>
      <PostImages images={post.images} fetchImage={(image) => fetchPostImage(post.id, image.id)} />

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
        {post.is_mine && !post.is_admin_post && !post.anonymity_switched && (
          <div className="ms-auto">
            <AnonymitySwitchButton isAnonymous={post.is_anonymous} onSwitch={switchAnonymity} />
          </div>
        )}
        {!post.is_mine && !post.is_admin_post && (
          <div className="ms-auto">
            <ReportButton kind="post" id={post.id} />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {showReplies && (
        <RepliesSection postId={post.id} highlightId={highlightReplyId} onCountChange={onRepliesChange} />
      )}
    </article>
  )
}

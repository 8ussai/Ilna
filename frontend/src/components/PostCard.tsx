import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Post } from '../api/posts'

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d={up ? 'M12 5l7 9h-4.5v5h-5v-5H5z' : 'M12 19l-7-9h4.5V5h5v5H19z'} />
    </svg>
  )
}

export function PostCard({
  post,
  isOwn,
  onDelete,
  onVote,
}: {
  post: Post
  isOwn: boolean
  onDelete: () => Promise<void>
  onVote: (dir: 1 | -1) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voting, setVoting] = useState(false)
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

  const voteButton = (dir: 1 | -1) => {
    const active = post.my_vote === dir
    return (
      <button
        type="button"
        disabled={voting}
        onClick={() => vote(dir)}
        aria-pressed={active}
        aria-label={dir === 1 ? t('feed.upvote') : t('feed.downvote')}
        title={dir === 1 ? t('feed.upvote') : t('feed.downvote')}
        className={`grid size-8 place-items-center rounded-md hover:bg-surface disabled:cursor-wait ${
          active ? (dir === 1 ? 'text-accent' : 'text-danger') : 'text-muted hover:text-fg'
        }`}
      >
        <Arrow up={dir === 1} />
      </button>
    )
  }

  const { author } = post
  const initials = `${author.first_name[0] ?? ''}${author.last_name[0] ?? ''}`.toUpperCase()
  // backend stores UTC without an offset marker
  const created = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(post.created_at) ? post.created_at : `${post.created_at}Z`)
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(created)

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await onDelete()
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-sm font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {author.first_name} {author.last_name}
            <span className="ms-2 text-sm font-normal text-muted">@{author.username}</span>
          </p>
          <time dateTime={created.toISOString()} className="text-sm text-muted">
            {date}
          </time>
        </div>

        {isOwn && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-danger"
          >
            {t('feed.delete')}
          </button>
        )}
        {isOwn && confirming && (
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted">{t('feed.confirmDelete')}</span>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-md px-2 py-1 font-medium text-danger hover:bg-surface disabled:opacity-50"
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
        )}
      </header>

      <p dir="auto" className="mt-3 whitespace-pre-wrap break-words">
        {post.content}
      </p>

      <div className="-ms-1.5 mt-3 flex items-center gap-1">
        {voteButton(1)}
        <span
          aria-label={t('feed.score', { count: post.votes_count })}
          className={`min-w-6 text-center text-sm font-semibold tabular-nums ${
            post.my_vote === 1 ? 'text-accent' : post.my_vote === -1 ? 'text-danger' : ''
          }`}
        >
          {post.votes_count}
        </span>
        {voteButton(-1)}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Post } from '../api/posts'

export function PostCard({
  post,
  isOwn,
  onDelete,
}: {
  post: Post
  isOwn: boolean
  onDelete: () => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  )
}

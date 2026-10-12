import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { createPost } from '../api/posts'
import type { Post, PostScope } from '../api/posts'
import { primaryButton } from './styles'

const MAX_LENGTH = 5000

export function PostComposer({
  scope,
  placeholder,
  onPosted,
}: {
  scope: PostScope
  placeholder: string
  onPosted: (post: Post) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const trimmed = content.trim()
  const tooLong = trimmed.length > MAX_LENGTH

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!trimmed || tooLong || busy) return

    setBusy(true)
    setError('')
    try {
      onPosted(await createPost(scope, trimmed))
      setContent('')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-card p-4">
      <label htmlFor={id} className="sr-only">
        {t('feed.composerLabel')}
      </label>
      <textarea
        id={id}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
        placeholder={placeholder}
        rows={3}
        className="block w-full resize-y bg-transparent text-fg placeholder:text-muted focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        {error && (
          <p role="alert" className="me-auto text-sm text-danger">
            {error}
          </p>
        )}
        {content.length > MAX_LENGTH * 0.9 && (
          <span className={`text-sm ${tooLong ? 'text-danger' : 'text-muted'}`}>
            {trimmed.length}/{MAX_LENGTH}
          </span>
        )}
        <button type="submit" disabled={!trimmed || tooLong || busy} className={`${primaryButton} h-10 w-auto`}>
          {busy ? t('feed.posting') : t('feed.post')}
        </button>
      </div>
    </form>
  )
}

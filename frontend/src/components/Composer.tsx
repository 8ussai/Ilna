import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { primaryButton } from './styles'

const MAX_LENGTH = 5000

// Text box used for both posts and replies.
export function Composer({
  label,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
  rows = 3,
}: {
  label: string
  placeholder: string
  submitLabel: string
  onSubmit: (content: string) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
  rows?: number
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
      await onSubmit(trimmed)
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
        {label}
      </label>
      <textarea
        id={id}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
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
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-10 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface hover:text-fg">
            {t('feed.cancel')}
          </button>
        )}
        <button type="submit" disabled={!trimmed || tooLong || busy} className={`${primaryButton} h-10 w-auto`}>
          {busy ? t('feed.posting') : submitLabel}
        </button>
      </div>
    </form>
  )
}

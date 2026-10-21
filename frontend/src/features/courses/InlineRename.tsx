import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { controlClass } from '../../components/Field'

type InlineRenameProps = {
  value: string
  label: string
  maxLength: number
  onSave: (value: string) => Promise<void>
  onDone: () => void
}

// A text field that replaces a name in place: Enter saves, Esc cancels, an empty or unchanged name just closes it.
export function InlineRename({ value, label, maxLength, onSave, onDone }: InlineRenameProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      onDone()
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave(trimmed)
      onDone()
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex min-w-0 flex-1 flex-col gap-1"
    >
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={draft}
          maxLength={maxLength}
          dir="auto"
          aria-label={label}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onDone()
            }
          }}
          className={`${controlClass} h-9 min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy} className="h-9 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-50">
          {t('courses.form.save')}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className="h-9 shrink-0 rounded-lg px-2 text-sm text-muted hover:bg-surface">
          {t('feed.cancel')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

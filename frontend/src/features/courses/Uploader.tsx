import { useId, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { formatBytes } from '../../lib/bytes'
import type { Upload } from './uploadQueue'

// a drop area that also opens the file picker
export function DropZone({
  label,
  hint,
  accept,
  onFiles,
  compact = false,
}: {
  label: string
  hint: string
  accept: string
  onFiles: (files: File[]) => void
  compact?: boolean
}) {
  const inputId = useId()
  const [dragging, setDragging] = useState(false)

  // takes the dropped files
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files]
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`relative rounded-xl border-2 border-dashed px-4 text-center focus-within:border-accent ${compact ? 'py-4' : 'py-6'} ${
        dragging ? 'border-accent bg-surface' : 'border-line'
      }`}
    >
      <input
        id={inputId}
        type="file"
        multiple
        accept={accept}
        aria-describedby={`${inputId}-hint`}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          // cleared so picking the same file again still fires onChange
          e.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      {!compact && (
        <svg viewBox="0 0 24 24" className="mx-auto mb-2 size-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      )}
      <label htmlFor={inputId} className="block font-medium">
        {label}
      </label>
      <p id={`${inputId}-hint`} className="mt-1 text-sm text-muted">
        {hint}
      </p>
    </div>
  )
}

// the uploads in progress, done or failed, with retry and dismiss
export function UploadList({
  items,
  onRetry,
  onDismiss,
}: {
  items: Upload[]
  onRetry: (key: number) => void
  onDismiss?: (key: number) => void
}) {
  const { t, i18n } = useTranslation()
  if (items.length === 0) return null

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const percent = Math.round(item.progress * 100)
        const finished = item.status === 'failed' || item.status === 'cancelled'
        return (
          <li key={item.key} className="rounded-lg border border-line px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              {item.status === 'done' && <CheckIcon />}
              <span dir="auto" className="min-w-0 flex-1 truncate font-medium">
                {item.file.name}
              </span>
              <span className="shrink-0 text-muted">{formatBytes(item.file.size, i18n.language)}</span>
            </div>
            {item.status === 'uploading' && (
              <div
                role="progressbar"
                aria-label={t('courses.upload.progress', { name: item.file.name })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface"
              >
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
              </div>
            )}
            <p className={`mt-1 text-xs ${item.status === 'failed' ? 'text-danger' : 'text-muted'}`}>
              {item.status === 'queued' && t('courses.upload.queued')}
              {item.status === 'uploading' && t('courses.upload.uploading', { percent })}
              {item.status === 'done' && t('courses.upload.done')}
              {item.status === 'cancelled' && t('courses.upload.cancelled')}
              {item.status === 'failed' && item.error}
              {(item.status === 'cancelled' || (item.status === 'failed' && item.retryable)) && (
                <button type="button" onClick={() => onRetry(item.key)} className="ms-2 font-medium text-fg underline">
                  {t('auth.retry')}
                </button>
              )}
              {finished && onDismiss && (
                <button type="button" onClick={() => onDismiss(item.key)} className="ms-2 font-medium text-fg underline">
                  {t('courses.upload.dismiss')}
                </button>
              )}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

// a check mark icon
export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

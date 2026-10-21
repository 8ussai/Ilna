import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { MAX_POST_IMAGE_BYTES, MAX_POST_IMAGES, POST_IMAGE_TYPES } from '../../api/posts'
import { primaryButton } from '../../components/styles'

type Picked = { file: File; url: string }

const MAX_LENGTH = 5000

// Text box used for both posts and replies. With anonymousLabel it also offers posting anonymously,
// and with allowImages it takes up to MAX_POST_IMAGES pictures (picked, or pasted into the text box).
export function Composer({
  label,
  placeholder,
  submitLabel,
  anonymousLabel,
  allowImages = false,
  onSubmit,
  onCancel,
  autoFocus,
  rows = 3,
}: {
  label: string
  placeholder: string
  submitLabel: string
  anonymousLabel?: string
  allowImages?: boolean
  onSubmit: (content: string, isAnonymous: boolean, images: File[]) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
  rows?: number
}) {
  const { t } = useTranslation()
  const id = useId()
  const [content, setContent] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [picked, setPicked] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // the previews are released when the box goes away
  const pickedRef = useRef(picked)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  // adds picked or pasted pictures, refusing wrong types, ones too big, and past the limit
  function addImages(files: File[]) {
    const room = MAX_POST_IMAGES - picked.length
    const accepted: Picked[] = []
    let problem = ''
    for (const file of files) {
      if (!POST_IMAGE_TYPES.includes(file.type)) problem = t('composer.photoType')
      else if (file.size > MAX_POST_IMAGE_BYTES) problem = t('composer.photoTooBig', { mb: MAX_POST_IMAGE_BYTES / 1024 ** 2 })
      else if (accepted.length >= room) problem = t('composer.photoLimit', { count: MAX_POST_IMAGES })
      else accepted.push({ file, url: URL.createObjectURL(file) })
    }
    setError(problem)
    if (accepted.length) setPicked((current) => [...current, ...accepted])
  }

  // removes a picked picture
  function removeImage(index: number) {
    setPicked((current) => {
      URL.revokeObjectURL(current[index].url)
      return current.filter((_, i) => i !== index)
    })
    setError('')
  }

  const trimmed = content.trim()
  const tooLong = trimmed.length > MAX_LENGTH

  // posts the text (and pictures), then clears the box
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!trimmed || tooLong || busy) return

    setBusy(true)
    setError('')
    try {
      await onSubmit(
        trimmed,
        anonymousLabel !== undefined && anonymous,
        picked.map((p) => p.file),
      )
      setContent('')
      picked.forEach((p) => URL.revokeObjectURL(p.url))
      setPicked([])
      // each post asks again, so nobody posts anonymously by accident
      setAnonymous(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError(t('errors.network'))
      else if (err instanceof ApiError && err.status === 413 && picked.length) setError(t('composer.storageFull'))
      else if (err instanceof ApiError && err.status === 400 && picked.length) setError(t('composer.photoRejected'))
      else setError(t('errors.generic'))
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
        onPaste={(e) => {
          if (!allowImages) return
          const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
          if (files.length) {
            e.preventDefault()
            addImages(files)
          }
        }}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className="block w-full resize-y bg-transparent text-fg placeholder:text-muted focus:outline-none"
      />
      {picked.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {picked.map((p, i) => (
            <li key={p.url} className="relative">
              <img src={p.url} alt="" className="size-20 rounded-lg border border-line object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label={t('composer.removePhoto', { number: i + 1 })}
                className="absolute -end-2 -top-2 grid size-6 place-items-center rounded-full bg-fg text-bg shadow hover:opacity-90"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {allowImages && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={POST_IMAGE_TYPES.join(',')}
              multiple
              hidden
              onChange={(e) => {
                addImages([...(e.target.files ?? [])])
                // picking the same file again should still add it
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={picked.length >= MAX_POST_IMAGES || busy}
              className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="M21 16l-5-5-9 9" />
              </svg>
              {t('composer.addPhotos')}
              {picked.length > 0 && <span className="text-xs">({picked.length}/{MAX_POST_IMAGES})</span>}
            </button>
          </>
        )}
        {anonymousLabel !== undefined && (
          <label className="me-auto flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="size-4 accent-(--accent)"
            />
            {anonymousLabel}
          </label>
        )}
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

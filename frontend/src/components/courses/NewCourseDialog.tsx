import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { DragEvent, FormEvent, Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import {
  addCourseLink,
  AUDIO_EXTENSIONS,
  COURSE_DESCRIPTION_MAX,
  COURSE_TITLE_MAX,
  createCourse,
  DOCUMENT_EXTENSIONS,
  fileExtension,
  uploadCourseMaterial,
} from '../../api/courses'
import type { Course, CourseColor, CourseLink } from '../../api/courses'
import { fetchStorage } from '../../api/me'
import { formatBytes } from '../../bytes'
import { Dialog } from '../Dialog'
import { controlClass, Field, FieldMessage } from '../Field'
import { primaryButton, secondaryButton } from '../styles'
import { CourseLookPicker } from './CourseLookPicker'
import { isSingleEmoji } from './courseColors'

type NewCourseDialogProps = {
  // the course was created but the dialog closed without "Done"; whatever was saved stays
  onClose: (created: Course | null) => void
  onDone: (course: Course) => void
}

// Step 1 creates the course; step 2 optionally adds files, links and recordings to it.
export function NewCourseDialog({ onClose, onDone }: NewCourseDialogProps) {
  const { t } = useTranslation()
  const [course, setCourse] = useState<Course | null>(null)
  // aborted when the dialog closes, stopping any upload still running
  const [uploads] = useState(() => new AbortController())

  function close() {
    uploads.abort()
    onClose(course)
  }

  return (
    <Dialog
      title={course ? t('courses.new.addTitle') : t('courses.new.title')}
      onClose={close}
      size={course ? 'lg' : 'sm'}
    >
      {course ? (
        <AddContentStep course={course} signal={uploads.signal} onDone={() => onDone(course)} />
      ) : (
        <DetailsStep onCreated={setCourse} onCancel={close} />
      )}
    </Dialog>
  )
}

function DetailsStep({ onCreated, onCancel }: { onCreated: (course: Course) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const descriptionId = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<CourseColor | null>(null)
  const [emoji, setEmoji] = useState('')
  const [errors, setErrors] = useState<{ title?: string; emoji?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('errors.required')
    if (emoji.trim() && !isSingleEmoji(emoji.trim())) next.emoji = t('courses.form.emojiInvalid')
    setErrors(next)
    if (next.title || next.emoji) return

    setBusy(true)
    try {
      const created = await createCourse({
        title: title.trim(),
        description: description.trim() || null,
        color,
        emoji: emoji.trim() || null,
      })
      onCreated(created)
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic') })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        label={t('courses.form.name')}
        value={title}
        maxLength={COURSE_TITLE_MAX}
        dir="auto"
        placeholder={t('courses.form.namePlaceholder')}
        error={errors.title}
        onChange={(e) => {
          setTitle(e.target.value)
          setErrors((current) => ({ ...current, title: undefined }))
        }}
      />

      <div>
        <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-medium">
          {t('courses.form.description')} <span className="font-normal text-muted">{t('courses.form.optional')}</span>
        </label>
        <textarea
          id={descriptionId}
          value={description}
          maxLength={COURSE_DESCRIPTION_MAX}
          dir="auto"
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${descriptionId}-hint`}
          className={`${controlClass} h-auto resize-y py-2.5`}
        />
        <FieldMessage
          id={descriptionId}
          hint={t('settings.contact.counter', { count: description.length, max: COURSE_DESCRIPTION_MAX })}
        />
      </div>

      <CourseLookPicker
        color={color}
        emoji={emoji}
        emojiError={errors.emoji}
        onColorChange={setColor}
        onEmojiChange={(value) => {
          setEmoji(value)
          setErrors((current) => ({ ...current, emoji: undefined }))
        }}
      />

      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className={`${secondaryButton} w-auto`}>
          {t('feed.cancel')}
        </button>
        <button type="submit" disabled={busy} className={`${primaryButton} w-auto`}>
          {busy ? t('auth.working') : t('courses.new.create')}
        </button>
      </div>
    </form>
  )
}

type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'

type Upload = {
  key: number
  file: File
  progress: number
  status: UploadStatus
  error?: string
  // a wrong file type fails the same way every time
  retryable?: boolean
}

function AddContentStep({ course, signal, onDone }: { course: Course; signal: AbortSignal; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [storageLeft, setStorageLeft] = useState<number | null>(null)
  const [links, setLinks] = useState<CourseLink[]>([])
  const [finishing, setFinishing] = useState(false)
  const linkFormRef = useRef<LinkFormHandle>(null)
  const introRef = useRef<HTMLDivElement>(null)

  // the queue lives in refs so the one-at-a-time worker always sees the latest list
  const queueRef = useRef<Upload[]>([])
  const runningRef = useRef(false)
  const leftRef = useRef<number | null>(null)
  const nextKey = useRef(1)

  // the Create button that had focus is gone, so start step 2 at its intro
  useEffect(() => introRef.current?.focus(), [])

  useEffect(() => {
    fetchStorage()
      .then((s) => {
        leftRef.current = Math.max(0, s.limit_bytes - s.used_bytes)
        setStorageLeft(leftRef.current)
      })
      // without it the server still enforces the limit; the line at the top just doesn't show
      .catch(() => {})
  }, [])

  function update(key: number, changes: Partial<Upload>) {
    queueRef.current = queueRef.current.map((u) => (u.key === key ? { ...u, ...changes } : u))
    setUploads(queueRef.current)
  }

  async function pump() {
    if (runningRef.current) return
    runningRef.current = true
    try {
      for (;;) {
        const next = queueRef.current.find((u) => u.status === 'queued')
        if (!next) break
        await uploadOne(next)
      }
    } finally {
      runningRef.current = false
    }
  }

  async function uploadOne(item: Upload) {
    const { file, key } = item
    if (leftRef.current !== null && file.size > leftRef.current) {
      update(key, { status: 'failed', error: t('courses.upload.noSpace') })
      return
    }
    update(key, { status: 'uploading', progress: 0 })
    const isAudio = AUDIO_EXTENSIONS.includes(fileExtension(file.name))
    try {
      const durationSec = isAudio ? await audioDuration(file) : null
      const material = await uploadCourseMaterial(course.id, file, {
        durationSec,
        signal,
        onProgress: (progress) => update(key, { progress }),
      })
      update(key, { status: 'done', progress: 1 })
      if (leftRef.current !== null) {
        leftRef.current = Math.max(0, leftRef.current - material.size_bytes)
        setStorageLeft(leftRef.current)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        update(key, { status: 'cancelled' })
        return
      }
      let error = t('courses.upload.failed')
      if (err instanceof ApiError) {
        if (err.status === 0) error = t('errors.network')
        else if (err.status === 413) error = t('courses.upload.noSpace')
        else if (err.status === 400) error = t('courses.upload.badType')
      }
      update(key, { status: 'failed', error, retryable: !(err instanceof ApiError && err.status === 400) })
    }
  }

  function addFiles(files: File[], allowed: string[]) {
    const added: Upload[] = files.map((file) => {
      const ok = allowed.includes(fileExtension(file.name))
      return {
        key: nextKey.current++,
        file,
        progress: 0,
        status: ok ? 'queued' : 'failed',
        error: ok ? undefined : t('courses.upload.badType'),
        retryable: ok,
      }
    })
    queueRef.current = [...queueRef.current, ...added]
    setUploads(queueRef.current)
    pump()
  }

  function retry(key: number) {
    update(key, { status: 'queued', error: undefined, progress: 0 })
    pump()
  }

  const busy = uploads.some((u) => u.status === 'queued' || u.status === 'uploading')

  async function finish() {
    setFinishing(true)
    const saved = (await linkFormRef.current?.flush()) ?? true
    setFinishing(false)
    if (saved) onDone()
  }

  return (
    <div className="space-y-6">
      <div ref={introRef} tabIndex={-1} className="rounded-xl bg-surface px-4 py-3 text-sm focus:outline-none">
        <p>{t('courses.new.created', { title: course.title })}</p>
        <p className="mt-0.5 text-muted">
          {t('courses.new.optionalHint')}
          {storageLeft !== null && <> {t('settings.storage.left', { left: formatBytes(storageLeft, i18n.language) })}</>}
        </p>
      </div>

      <section aria-labelledby="new-course-materials" className="space-y-3">
        <h3 id="new-course-materials" className="font-semibold">
          {t('courses.new.materials')}
        </h3>
        <DropZone
          label={t('courses.new.dropFiles')}
          hint={t('courses.new.fileTypes', { types: extensionList(DOCUMENT_EXTENSIONS) })}
          accept={DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(',')}
          onFiles={(files) => addFiles(files, DOCUMENT_EXTENSIONS)}
        />
        <UploadList items={uploads.filter((u) => !AUDIO_EXTENSIONS.includes(fileExtension(u.file.name)))} onRetry={retry} />
      </section>

      <section aria-labelledby="new-course-links" className="space-y-3">
        <h3 id="new-course-links" className="font-semibold">
          {t('courses.new.links')}
        </h3>
        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((link) => (
              <li key={link.id} className="flex items-center gap-2 text-sm">
                <CheckIcon />
                <span dir="auto" className="font-medium">
                  {link.title}
                </span>
                <span dir="ltr" className="min-w-0 truncate text-muted">
                  {link.url}
                </span>
              </li>
            ))}
          </ul>
        )}
        <LinkForm courseId={course.id} ref={linkFormRef} onAdded={(link) => setLinks((current) => [...current, link])} />
      </section>

      <section aria-labelledby="new-course-voice" className="space-y-3">
        <h3 id="new-course-voice" className="font-semibold">
          {t('courses.new.voice')}
        </h3>
        <DropZone
          label={t('courses.new.dropAudio')}
          hint={t('courses.new.audioHint', { types: extensionList(AUDIO_EXTENSIONS) })}
          accept={['audio/*', ...AUDIO_EXTENSIONS.map((e) => `.${e}`)].join(',')}
          onFiles={(files) => addFiles(files, AUDIO_EXTENSIONS)}
        />
        <UploadList items={uploads.filter((u) => AUDIO_EXTENSIONS.includes(fileExtension(u.file.name)))} onRetry={retry} />
      </section>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" role="status">
          {busy ? t('courses.upload.waiting') : ''}
        </p>
        <button type="button" onClick={finish} disabled={busy || finishing} className={`${primaryButton} sm:w-auto`}>
          {t('courses.new.done')}
        </button>
      </div>
    </div>
  )
}

function DropZone({ label, hint, accept, onFiles }: { label: string; hint: string; accept: string; onFiles: (files: File[]) => void }) {
  const inputId = useId()
  const [dragging, setDragging] = useState(false)

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
      className={`relative rounded-xl border-2 border-dashed px-4 py-6 text-center focus-within:border-accent ${
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
        className="peer absolute inset-0 cursor-pointer opacity-0"
      />
      <svg viewBox="0 0 24 24" className="mx-auto size-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <label htmlFor={inputId} className="mt-2 block font-medium">
        {label}
      </label>
      <p id={`${inputId}-hint`} className="mt-1 text-sm text-muted">
        {hint}
      </p>
    </div>
  )
}

function UploadList({ items, onRetry }: { items: Upload[]; onRetry: (key: number) => void }) {
  const { t, i18n } = useTranslation()
  if (items.length === 0) return null

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const percent = Math.round(item.progress * 100)
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
            </p>
          </li>
        )
      })}
    </ul>
  )
}

type LinkFormHandle = { flush: () => Promise<boolean> }

// Saves one link at a time; "Done" also saves whatever is typed in it.
function LinkForm({
  courseId,
  ref,
  onAdded,
}: {
  courseId: number
  ref: Ref<LinkFormHandle>
  onAdded: (link: CourseLink) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [errors, setErrors] = useState<{ title?: string; url?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  // true when the form is empty or was saved, false when the user needs to fix something
  async function save(): Promise<boolean> {
    if (!title.trim() && !url.trim()) return true
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('errors.required')
    if (!/^https?:\/\/[^\s/]+/i.test(url.trim())) next.url = t('courses.links.urlInvalid')
    setErrors(next)
    if (next.title || next.url) return false

    setBusy(true)
    try {
      onAdded(await addCourseLink(courseId, title.trim(), url.trim()))
      setTitle('')
      setUrl('')
      return true
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic') })
      return false
    } finally {
      setBusy(false)
    }
  }

  useImperativeHandle(ref, () => ({ flush: save }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('courses.links.title')}
          value={title}
          maxLength={200}
          dir="auto"
          error={errors.title}
          onChange={(e) => {
            setTitle(e.target.value)
            setErrors((current) => ({ ...current, title: undefined }))
          }}
        />
        <Field
          label={t('courses.links.url')}
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          value={url}
          error={errors.url}
          onChange={(e) => {
            setUrl(e.target.value)
            setErrors((current) => ({ ...current, url: undefined }))
          }}
        />
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${secondaryButton} w-auto`}>
        {busy ? t('auth.working') : t('courses.links.add')}
      </button>
    </form>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

// ".pdf, .ppt" kept left-to-right inside Arabic text, where the dots would otherwise jump to the wrong end
function extensionList(extensions: string[]) {
  return `⁦${extensions.map((e) => `.${e}`).join(', ')}⁩`
}

// the backend stores the length the browser reports; null when it can't be read
function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), 5000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}

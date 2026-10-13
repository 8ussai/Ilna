import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { AUDIO_EXTENSIONS, deleteMaterial, fetchTranscript, renameMaterial, retryTranscript } from '../../api/courses'
import type { CourseMaterial, Transcript, TranscriptLanguage, TranscriptSegment } from '../../api/courses'
import { formatDate, formatDuration, parseServerDate } from '../../dates'
import { DeleteButton } from '../DeleteButton'
import { controlClass } from '../Field'
import { primaryButtonInline, secondaryButtonInline } from '../styles'
import { InlineRename } from './InlineRename'
import { IndexBadge } from './MaterialsTab'
import { DropZone, UploadList } from './Uploader'
import { acceptList, extensionList, useUploadQueue } from './uploadQueue'
import { useMaterialUrl } from './useMaterialUrl'
import { VoiceRecorder } from './VoiceRecorder'

type VoiceTabProps = {
  courseId: number
  // recordings only, newest first
  recordings: CourseMaterial[]
  onAdded: (material: CourseMaterial) => void
  onChanged: (material: CourseMaterial) => void
  onDeleted: (materialId: number) => void
}

export function VoiceTab({ courseId, recordings, onAdded, onChanged, onDeleted }: VoiceTabProps) {
  const { t } = useTranslation()
  const [recording, setRecording] = useState(false)
  // a new recording opens by itself once its upload finishes, so its transcript can be watched coming in
  const [openId, setOpenId] = useState<number | null>(null)
  const { uploads, addFiles, retry, dismiss } = useUploadQueue({
    courseId,
    keepDone: false,
    onUploaded: (material) => {
      onAdded(material)
      setOpenId(material.id)
    },
  })
  const recordButtonRef = useRef<HTMLButtonElement>(null)

  function closeRecorder() {
    setRecording(false)
    recordButtonRef.current?.focus()
  }

  return (
    <div className="space-y-4">
      {recording ? (
        <VoiceRecorder
          onRecorded={(file, durationSec) => {
            addFiles([file], AUDIO_EXTENSIONS, durationSec)
            closeRecorder()
          }}
          onCancel={closeRecorder}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <button
            ref={recordButtonRef}
            type="button"
            onClick={() => setRecording(true)}
            className={`${primaryButtonInline} inline-flex w-full items-center justify-center gap-2 sm:w-44`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
            {t('courses.voice.record')}
          </button>
          <DropZone
            compact
            label={t('courses.voice.upload')}
            hint={t('courses.new.audioHint', { types: extensionList(AUDIO_EXTENSIONS) })}
            accept={['audio/*', acceptList(AUDIO_EXTENSIONS)].join(',')}
            onFiles={(files) => addFiles(files, AUDIO_EXTENSIONS)}
          />
        </div>
      )}

      <UploadList items={uploads} onRetry={retry} onDismiss={dismiss} />

      {recordings.length === 0 && uploads.length === 0 ? (
        <p className="py-8 text-center text-muted">{t('courses.voice.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {recordings.map((material) => (
            <RecordingCard
              key={material.id}
              courseId={courseId}
              material={material}
              open={openId === material.id}
              onToggle={() => setOpenId((current) => (current === material.id ? null : material.id))}
              onChanged={onChanged}
              onDeleted={() => onDeleted(material.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function RecordingCard({
  courseId,
  material,
  open,
  onToggle,
  onChanged,
  onDeleted,
}: {
  courseId: number
  material: CourseMaterial
  open: boolean
  onToggle: () => void
  onChanged: (material: CourseMaterial) => void
  onDeleted: () => void
}) {
  const { t, i18n } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState('')
  const panelId = useId()

  async function remove() {
    setError('')
    try {
      await deleteMaterial(courseId, material.id)
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(t('errors.generic'))
        return
      }
    }
    onDeleted()
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? t('courses.voice.collapse', { name: material.file_name }) : t('courses.voice.expand', { name: material.file_name })}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg hover:opacity-90"
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 15 6-6 6 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.6A1 1 0 0 0 8 5.5Z" />
            </svg>
          )}
        </button>

        {renaming ? (
          <InlineRename
            value={material.file_name}
            label={t('courses.materials.renameLabel')}
            maxLength={255}
            onSave={async (name) => onChanged(await renameMaterial(courseId, material.id, name))}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <div className="min-w-0 flex-1 basis-48">
            <p dir="auto" className="truncate font-medium">
              {material.file_name}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {material.duration_sec != null && (
                <>
                  <span dir="ltr">{formatDuration(material.duration_sec)}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{formatDate(parseServerDate(material.created_at), i18n.language)}</span>
              <TranscriptBadge material={material} />
            </p>
            {error && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        )}

        {!renaming && (
          <div className="-me-2 flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setRenaming(true)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
              {t('courses.menu.rename')}
            </button>
            <DeleteButton question={t('courses.voice.confirmDelete')} onConfirm={remove} />
          </div>
        )}
      </div>

      <div id={panelId} hidden={!open}>
        {open && <RecordingPanel courseId={courseId} material={material} onChanged={onChanged} />}
      </div>
    </li>
  )
}

function TranscriptBadge({ material }: { material: CourseMaterial }) {
  const { t } = useTranslation()
  const transcript = material.transcript
  if (!transcript) return null
  if (transcript.status === 'done') return <IndexBadge ready={material.is_rag_indexed} />
  const label =
    transcript.status === 'processing'
      ? t('courses.voice.transcribing', { percent: Math.round(transcript.progress * 100) })
      : transcript.status === 'pending'
        ? t('courses.voice.waiting')
        : t('courses.voice.failed')
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-xs font-medium ${transcript.status === 'failed' ? 'text-danger' : 'text-muted'}`}>
      {transcript.status !== 'failed' && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-muted" />}
      {label}
    </span>
  )
}

// The player and the transcript under it; clicking a line plays from there.
function RecordingPanel({
  courseId,
  material,
  onChanged,
}: {
  courseId: number
  material: CourseMaterial
  onChanged: (material: CourseMaterial) => void
}) {
  const { t } = useTranslation()
  const file = useMaterialUrl(courseId, material.id, true)
  const audioRef = useRef<HTMLAudioElement>(null)
  const pendingSeek = useRef<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const status = material.transcript?.status

  function seek(seconds: number) {
    const audio = audioRef.current
    // the file may still be loading; play from there once it can
    if (!audio || audio.readyState < 1) {
      pendingSeek.current = seconds
      return
    }
    audio.currentTime = seconds
    audio.play().catch(() => {})
  }

  return (
    <div className="space-y-4 border-t border-line px-4 py-4">
      {file.status === 'ready' && file.url ? (
        <audio
          ref={audioRef}
          src={file.url}
          controls
          preload="metadata"
          onLoadedMetadata={() => {
            if (pendingSeek.current !== null) {
              seek(pendingSeek.current)
              pendingSeek.current = null
            }
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="w-full"
        />
      ) : file.status === 'error' ? (
        <p className="text-sm text-muted">
          {t('courses.voice.loadFailed')}{' '}
          <button type="button" onClick={file.retry} className="font-medium text-fg underline">
            {t('auth.retry')}
          </button>
        </p>
      ) : (
        <p className="text-sm text-muted" role="status">
          {t('courses.voice.loadingAudio')}
        </p>
      )}

      {status === 'done' ? (
        <TranscriptView
          courseId={courseId}
          material={material}
          currentTime={currentTime}
          onSeek={seek}
          onRetried={onChanged}
        />
      ) : status === 'failed' ? (
        <div className="space-y-3 rounded-xl bg-surface p-4">
          <p className="text-sm text-danger">{t('courses.voice.failedLong')}</p>
          {material.transcript?.error && <p className="text-xs text-muted">{material.transcript.error}</p>}
          <RetryTranscript courseId={courseId} material={material} onRetried={onChanged} />
        </div>
      ) : (
        <TranscriptProgress material={material} />
      )}
    </div>
  )
}

function TranscriptProgress({ material }: { material: CourseMaterial }) {
  const { t } = useTranslation()
  const progress = material.transcript?.progress ?? 0
  const percent = Math.round(progress * 100)
  const processing = material.transcript?.status === 'processing'

  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-sm font-medium">{processing ? t('courses.voice.transcribing', { percent }) : t('courses.voice.waiting')}</p>
      <div
        role="progressbar"
        aria-label={t('courses.voice.transcriptProgress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">{t('courses.voice.transcribeHint')}</p>
    </div>
  )
}

function TranscriptView({
  courseId,
  material,
  currentTime,
  onSeek,
  onRetried,
}: {
  courseId: number
  material: CourseMaterial
  currentTime: number
  onSeek: (seconds: number) => void
  onRetried: (material: CourseMaterial) => void
}) {
  const { t } = useTranslation()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [redoing, setRedoing] = useState(false)

  // a redone transcript passes through pending first, which unmounts this, so mounting is when to fetch
  useEffect(() => {
    let ignore = false
    fetchTranscript(courseId, material.id)
      .then((result) => {
        if (ignore) return
        setTranscript(result)
        setFailed(false)
      })
      .catch(() => {
        if (!ignore) setFailed(true)
      })
    return () => {
      ignore = true
    }
  }, [courseId, material.id, attempt])

  if (failed) {
    return (
      <p className="text-sm text-muted">
        {t('courses.voice.transcriptFailed')}{' '}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium text-fg underline">
          {t('auth.retry')}
        </button>
      </p>
    )
  }
  if (!transcript) {
    return (
      <p className="text-sm text-muted" role="status">
        {t('feed.loading')}
      </p>
    )
  }

  const segments = transcript.segments ?? []
  // the line being played; the last one that has started
  let activeIndex = -1
  segments.forEach((segment: TranscriptSegment, i) => {
    if (segment.start <= currentTime) activeIndex = i
  })

  return (
    <section aria-labelledby={`transcript-${material.id}`} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={`transcript-${material.id}`} className="font-semibold">
          {t('courses.voice.transcript')}
        </h4>
        <p className="text-xs text-muted">{t('courses.voice.seekHint')}</p>
      </div>
      {segments.length === 0 ? (
        <p className="text-sm text-muted">{t('courses.voice.noSpeech')}</p>
      ) : (
        <ol
          dir={transcript.language === 'ar' ? 'rtl' : transcript.language ? 'ltr' : 'auto'}
          className="max-h-96 space-y-0.5 overflow-y-auto rounded-xl bg-surface p-2"
        >
          {segments.map((segment, i) => (
            <li key={`${segment.start}-${i}`}>
              <button
                type="button"
                onClick={() => onSeek(segment.start)}
                aria-current={i === activeIndex ? 'true' : undefined}
                className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-bg ${i === activeIndex ? 'bg-bg ring-1 ring-accent' : ''}`}
              >
                <span dir="ltr" className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted tabular-nums">
                  {formatDuration(segment.start)}
                </span>
                <span className="min-w-0 flex-1">{segment.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="pt-1">
        {redoing ? (
          <div className="rounded-xl bg-surface p-4">
            <RetryTranscript courseId={courseId} material={material} onRetried={onRetried} onCancel={() => setRedoing(false)} redo />
          </div>
        ) : (
          <button type="button" onClick={() => setRedoing(true)} className="text-sm text-muted underline hover:text-fg">
            {t('courses.voice.redo')}
          </button>
        )}
      </div>
    </section>
  )
}

// Transcribe again, optionally telling Whisper the language when it guessed wrong.
function RetryTranscript({
  courseId,
  material,
  onRetried,
  onCancel,
  redo = false,
}: {
  courseId: number
  material: CourseMaterial
  onRetried: (material: CourseMaterial) => void
  onCancel?: () => void
  redo?: boolean
}) {
  const { t } = useTranslation()
  const languageId = useId()
  const [language, setLanguage] = useState<TranscriptLanguage | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const transcript = await retryTranscript(courseId, material.id, language || null)
      onRetried({ ...material, is_rag_indexed: false, transcript })
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {redo && <p className="text-sm">{t('courses.voice.redoHint')}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={languageId} className="mb-1.5 block text-sm font-medium">
            {t('courses.voice.language')}
          </label>
          <select
            id={languageId}
            value={language}
            onChange={(e) => setLanguage(e.target.value as TranscriptLanguage | '')}
            className={`${controlClass} w-44`}
          >
            <option value="">{t('courses.voice.detect')}</option>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
        <button type="button" onClick={submit} disabled={busy} className={primaryButtonInline}>
          {busy ? t('auth.working') : t('courses.voice.retry')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButtonInline}>
            {t('feed.cancel')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

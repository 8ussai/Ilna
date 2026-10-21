import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { createNote, deleteNote, NOTE_CONTENT_MAX, NOTE_TITLE_MAX, updateNote } from '../../api/courses'
import type { CourseNote } from '../../api/courses'
import { useAutosave } from '../../hooks/useAutosave'
import type { AutosaveStatus } from '../../hooks/useAutosave'
import { DeleteButton } from '../../components/DeleteButton'
import { smallSecondaryButton } from '../../components/styles'

type Draft = { title: string; content: string }

const sameDraft = (a: Draft, b: Draft) => a.title === b.title && a.content === b.content

type TextNoteEditorProps = {
  courseId: number
  // null for a new note: it's created by the first save that has something in it
  note: CourseNote | null
  onSaved: (note: CourseNote) => void
  onDeleted: (noteId: number) => void
  onClose: () => void
}

export function TextNoteEditor({ courseId, note, onSaved, onDeleted, onClose }: TextNoteEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>({ title: note?.title ?? '', content: note?.content ?? '' })
  const [noteId, setNoteId] = useState<number | null>(note?.id ?? null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  // fixed when the editor opens, so a new note getting its id doesn't move the cursor
  const [isNew] = useState(note === null)
  // read by the save, which can finish after a re-render
  const noteIdRef = useRef(noteId)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const { status, flush } = useAutosave(draft, async ({ title, content }) => {
    const cleanTitle = title.trim() || null
    if (noteIdRef.current === null) {
      // an untouched new note isn't worth creating
      if (!cleanTitle && !content.trim()) return
      const created = await createNote(courseId, { title: cleanTitle, content })
      noteIdRef.current = created.id
      setNoteId(created.id)
      onSaved(created)
      return
    }
    onSaved(await updateNote(courseId, noteIdRef.current, { title: cleanTitle, content }))
  }, { isEqual: sameDraft })

  // a new note starts at its title, an existing one where the writing is
  useEffect(() => {
    if (!isNew) {
      const area = contentRef.current
      area?.focus()
      area?.setSelectionRange(area.value.length, area.value.length)
    } else {
      titleRef.current?.focus()
    }
  }, [isNew])

  async function close() {
    if (await flush()) onClose()
    else setConfirmLeave(true)
  }

  async function remove() {
    const id = noteIdRef.current
    if (id === null) {
      onClose()
      return
    }
    try {
      await deleteNote(courseId, id)
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    onDeleted(id)
  }

  const nearLimit = draft.content.length > NOTE_CONTENT_MAX * 0.9

  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={close}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t('courses.notes.allNotes')}
        </button>
        {/* nothing to report for a new note until something is typed */}
        {(noteId !== null || status !== 'saved') && <SaveStatus status={status} onRetry={() => flush()} />}
        {(noteId !== null || draft.title || draft.content) && (
          <div className="ms-auto">
            <DeleteButton question={t('courses.notes.confirmDelete')} onConfirm={remove} />
          </div>
        )}
      </div>

      {confirmLeave && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 text-sm">
          <span className="flex-1">{t('courses.notes.leaveUnsaved')}</span>
          <button type="button" onClick={() => setConfirmLeave(false)} className={smallSecondaryButton}>
            {t('courses.notes.keepEditing')}
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-danger hover:bg-bg">
            {t('courses.notes.leaveAnyway')}
          </button>
        </div>
      )}

      <div className="space-y-2 p-4 sm:p-6">
        <input
          ref={titleRef}
          value={draft.title}
          maxLength={NOTE_TITLE_MAX}
          dir="auto"
          aria-label={t('courses.notes.titleLabel')}
          placeholder={t('courses.notes.titlePlaceholder')}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onBlur={() => flush()}
          onKeyDown={(e) => {
            // Enter in the title moves on to the text, like most note apps
            if (e.key === 'Enter') {
              e.preventDefault()
              contentRef.current?.focus()
            }
          }}
          className="w-full bg-transparent font-serif text-2xl font-semibold placeholder:text-muted/60 focus:outline-none!"
        />
        <textarea
          ref={contentRef}
          value={draft.content}
          maxLength={NOTE_CONTENT_MAX}
          dir="auto"
          aria-label={t('courses.notes.contentLabel')}
          placeholder={t('courses.notes.contentPlaceholder')}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          onBlur={() => flush()}
          className="block min-h-[50vh] w-full resize-none bg-transparent leading-relaxed [field-sizing:content] placeholder:text-muted/60 focus:outline-none!"
        />
        {nearLimit && (
          <p className="text-end text-xs text-muted">
            {t('settings.contact.counter', { count: draft.content.length, max: NOTE_CONTENT_MAX })}
          </p>
        )}
      </div>
    </div>
  )
}

function SaveStatus({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  const { t } = useTranslation()

  if (status === 'error') {
    return (
      // announced, unlike the routine Saving…/Saved that changes every few seconds while typing
      <p role="alert" className="text-sm text-danger">
        {t('courses.notes.saveFailed')}{' '}
        <button type="button" onClick={onRetry} className="font-medium underline">
          {t('courses.notes.retryNow')}
        </button>
      </p>
    )
  }
  return (
    <p className="text-sm text-muted">
      {status === 'saved' ? t('courses.notes.saved') : t('courses.notes.saving')}
    </p>
  )
}

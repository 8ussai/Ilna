import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { createNote, deleteNote, NOTE_CONTENT_MAX, NOTE_TITLE_MAX, updateNote } from '../../api/courses'
import type { CourseNote } from '../../api/courses'
import { useAutosave } from '../../hooks/useAutosave'
import type { AutosaveStatus } from '../../hooks/useAutosave'
import { DeleteButton } from '../../components/DeleteButton'
import { smallSecondaryButton } from '../../components/styles'
import { safeFileName } from '../../lib/saveBlob'
import { NoteDownloadButton } from './NoteDownloadButton'
import { downloadTextNote } from './noteExport'

type Draft = { title: string; content: string }

// whether two drafts have the same title and text
const sameDraft = (a: Draft, b: Draft) => a.title === b.title && a.content === b.content

type TextNoteEditorProps = {
  courseId: number
  // null for a new note: it's created by the first save that has something in it
  note: CourseNote | null
  onSaved: (note: CourseNote) => void
  onDeleted: (noteId: number) => void
  onClose: () => void
  // switches to read mode; only offered once the note exists
  onRead: () => void
}

// the typed note editor; it saves by itself as you type
export function TextNoteEditor({ courseId, note, onSaved, onDeleted, onClose, onRead }: TextNoteEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>({ title: note?.title ?? '', content: note?.content ?? '' })
  const [noteId, setNoteId] = useState<number | null>(note?.id ?? null)
  // where to go if the user leaves anyway after a failed save: the notes list or read mode
  const [leaveTo, setLeaveTo] = useState<(() => void) | null>(null)
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

  // saves anything left, then goes on (or asks, if the save failed)
  async function leave(next: () => void) {
    if (await flush()) next()
    else setLeaveTo(() => next)
  }

  // saves anything left, then closes
  function close() {
    void leave(onClose)
  }

  // saves anything left, then switches to read mode
  function goRead() {
    void leave(onRead)
  }

  // deletes the note
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
          <div className="ms-auto flex flex-wrap items-center gap-1">
            {noteId !== null && (
              <button
                type="button"
                onClick={goRead}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2Zm0 0v14" />
                </svg>
                {t('courses.notes.read')}
              </button>
            )}
            {(draft.title.trim() || draft.content.trim()) && (
              <NoteDownloadButton
                drawing={false}
                onDownload={() => {
                  const firstLine = draft.content.split('\n').find((line) => line.trim()) ?? ''
                  downloadTextNote(draft.title.trim(), draft.content, safeFileName(firstLine, t('courses.notes.untitled')))
                }}
              />
            )}
            <DeleteButton question={t('courses.notes.confirmDelete')} onConfirm={remove} />
          </div>
        )}
      </div>

      {leaveTo && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 text-sm">
          <span className="flex-1">{t('courses.notes.leaveUnsaved')}</span>
          <button type="button" onClick={() => setLeaveTo(null)} className={smallSecondaryButton}>
            {t('courses.notes.keepEditing')}
          </button>
          <button type="button" onClick={leaveTo} className="h-9 rounded-lg px-3 text-sm text-danger hover:bg-bg">
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

// "Saving…", "Saved" or a retry button
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

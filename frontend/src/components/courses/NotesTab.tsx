import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { deleteNote } from '../../api/courses'
import type { CourseNote } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../dates'
import { DeleteButton } from '../DeleteButton'
import { primaryButtonInline } from '../styles'
import { TextNoteEditor } from './TextNoteEditor'

type NotesTabProps = {
  courseId: number
  // newest change first
  notes: CourseNote[]
  onSaved: (note: CourseNote) => void
  onDeleted: (noteId: number) => void
}

// which note the editor has open; `key` keeps the editor mounted when a new note gets its id
type Editing = { key: number; note: CourseNote | null }

export function NotesTab({ courseId, notes, onSaved, onDeleted }: NotesTabProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<Editing | null>(null)
  // where focus goes back to when the editor closes
  const returnFocusRef = useRef<number | 'new' | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const nextKey = useRef(1)

  function open(note: CourseNote | null) {
    returnFocusRef.current = note?.id ?? 'new'
    setEditing({ key: nextKey.current++, note })
  }

  useEffect(() => {
    if (editing || returnFocusRef.current === null) return
    const target = returnFocusRef.current
    returnFocusRef.current = null
    const selector = target === 'new' ? '[data-new-note]' : `[data-note-id="${target}"]`
    // a deleted note's row is gone, so fall back to "New note"
    ;(listRef.current?.querySelector<HTMLElement>(selector) ?? listRef.current?.querySelector<HTMLElement>('[data-new-note]'))?.focus()
  }, [editing])

  if (editing) {
    return (
      <TextNoteEditor
        key={editing.key}
        courseId={courseId}
        note={editing.note}
        onSaved={(note) => {
          // a new note's row is where focus returns once it exists
          if (returnFocusRef.current === 'new') returnFocusRef.current = note.id
          onSaved(note)
        }}
        onDeleted={(id) => {
          setEditing(null)
          onDeleted(id)
        }}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <div ref={listRef} className="space-y-4">
      <button type="button" data-new-note onClick={() => open(null)} className={`${primaryButtonInline} inline-flex items-center gap-2`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t('courses.notes.new')}
      </button>

      {notes.length === 0 ? (
        <p className="py-8 text-center text-muted">{t('courses.notes.empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((note) => (
            <NoteCard key={note.id} courseId={courseId} note={note} onOpen={() => open(note)} onDeleted={() => onDeleted(note.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NoteCard({
  courseId,
  note,
  onOpen,
  onDeleted,
}: {
  courseId: number
  note: CourseNote
  onOpen: () => void
  onDeleted: () => void
}) {
  const { t, i18n } = useTranslation()
  const [error, setError] = useState('')
  const isDrawing = note.kind === 'drawing'
  const lines = isDrawing ? [] : note.content.split('\n').filter((line) => line.trim())
  // without a title, the first line stands in for it and the preview starts after it
  const title = note.title || lines[0] || (isDrawing ? t('courses.notes.untitledDrawing') : t('courses.notes.untitled'))
  const preview = (note.title ? lines : lines.slice(1)).slice(0, 3)

  async function remove() {
    setError('')
    try {
      await deleteNote(courseId, note.id)
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(t('errors.generic'))
        return
      }
    }
    onDeleted()
  }

  const body = (
    <>
      <span className="flex items-center gap-2">
        <NoteIcon drawing={isDrawing} />
        <span dir="auto" className="min-w-0 flex-1 truncate font-semibold">
          {title}
        </span>
      </span>
      {preview.length > 0 && (
        <span className="mt-1.5 text-sm text-muted">
          {/* each line finds its own direction, like in the editor, so Arabic and English lines both sit right */}
          {preview.map((line, i) => (
            <span key={i} dir="auto" className="block truncate">
              {line}
            </span>
          ))}
        </span>
      )}
      <span className="sr-only">, {isDrawing ? t('courses.notes.drawing') : t('courses.notes.text')}</span>
    </>
  )

  return (
    // min-w-0: the one-line previews mustn't widen the grid column past the screen
    <li className="flex min-w-0 flex-col rounded-2xl border border-line bg-card hover:border-muted/50">
      {isDrawing ? (
        // drawings open in the drawing editor, which comes with the drawing tools
        <div className="flex min-h-24 flex-1 flex-col p-4 pb-2">{body}</div>
      ) : (
        <button type="button" data-note-id={note.id} onClick={onOpen} className="flex min-h-24 flex-1 flex-col rounded-t-2xl p-4 pb-2 text-start">
          {body}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-2 px-4 pb-2">
        <span className="text-xs text-muted">
          {t('courses.notes.updated', { when: formatRelative(parseServerDate(note.updated_at), i18n.language) })}
        </span>
        <div className="-me-2">
          <DeleteButton question={t('courses.notes.confirmDelete')} onConfirm={remove} />
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  )
}

function NoteIcon({ drawing }: { drawing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {drawing ? <path d="m15 5 4 4L8 20H4v-4L15 5Z" /> : <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" />}
    </svg>
  )
}

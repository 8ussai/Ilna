import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { deleteNote } from '../../api/courses'
import type { CourseNote } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../lib/dates'
import { DeleteButton } from '../../components/DeleteButton'
import { primaryButtonInline } from '../../components/styles'
import { DrawingNoteEditor } from './DrawingNoteEditor'
import { DrawingThumbnail } from './DrawingThumbnail'
import { NoteDownloadButton } from './NoteDownloadButton'
import { downloadNote } from './noteExport'
import { TextNoteEditor } from './TextNoteEditor'
import { useCourseCanDownloadNotes, useCourseCanEdit } from './courseAccess'
import { NoteViewer } from './NoteViewer'

type NotesTabProps = {
  courseId: number
  // newest change first
  notes: CourseNote[]
  onSaved: (note: CourseNote) => void
  onDeleted: (noteId: number) => void
}

// which note is open and how; `key` keeps the editor mounted when a new note gets its id.
// The owner's existing notes open in read mode, new ones in the editor.
type Editing = { key: number; note: CourseNote | null; kind: CourseNote['kind']; mode: 'read' | 'edit' }

// the Notes tab: typed and drawn notes, opened in their editor (or read-only viewer)
export function NotesTab({ courseId, notes, onSaved, onDeleted }: NotesTabProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<Editing | null>(null)
  // where focus goes back to when the editor closes
  const returnFocusRef = useRef<number | 'new' | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const nextKey = useRef(1)
  const [choosing, setChoosing] = useState(false)
  const choicesRef = useRef<HTMLDivElement>(null)
  // in a course someone else owns, notes open read-only
  const canEdit = useCourseCanEdit()

  // opens a note, or a new one of a kind
  function open(note: CourseNote | null, kind: CourseNote['kind'] = note?.kind ?? 'text') {
    returnFocusRef.current = note?.id ?? 'new'
    setChoosing(false)
    setEditing({ key: nextKey.current++, note, kind, mode: note ? 'read' : 'edit' })
  }

  useEffect(() => {
    if (choosing) choicesRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [choosing])

  useEffect(() => {
    if (editing || returnFocusRef.current === null) return
    const target = returnFocusRef.current
    returnFocusRef.current = null
    const selector = target === 'new' ? '[data-new-note]' : `[data-note-id="${target}"]`
    // a deleted note's row is gone, so fall back to "New note"
    ;(listRef.current?.querySelector<HTMLElement>(selector) ?? listRef.current?.querySelector<HTMLElement>('[data-new-note]'))?.focus()
  }, [editing])

  if (editing && editing.note && (editing.mode === 'read' || !canEdit)) {
    // the list's copy is the newest, after saves made in the editor
    const latest = notes.find((n) => n.id === editing.note?.id) ?? editing.note
    return (
      <NoteViewer
        // a fresh viewer each time, so it focuses its back button again
        key={editing.key}
        note={latest}
        onClose={() => setEditing(null)}
        // a new key gives a fresh editor that starts from the latest saved version
        onEdit={canEdit ? () => setEditing({ ...editing, note: latest, mode: 'edit', key: nextKey.current++ }) : undefined}
      />
    )
  }

  if (editing) {
    const editorKey = editing.key
    const editorProps = {
      courseId,
      note: editing.note,
      onSaved: (note: CourseNote) => {
        // a new note's row is where focus returns once it exists
        if (returnFocusRef.current === 'new') returnFocusRef.current = note.id
        // read mode opens on this; same key, so the editor stays mounted. A save that finishes
        // after this editor closed leaves whatever is open now alone.
        setEditing((e) => (e && e.key === editorKey ? { ...e, note } : e))
        onSaved(note)
      },
      onDeleted: (id: number) => {
        setEditing(null)
        onDeleted(id)
      },
      onClose: () => setEditing(null),
      onRead: () => setEditing((e) => (e?.note ? { ...e, mode: 'read' as const, key: nextKey.current++ } : e)),
    }
    return editing.kind === 'drawing' ? (
      <DrawingNoteEditor key={editing.key} {...editorProps} onSwitchToText={() => open(null, 'text')} />
    ) : (
      <TextNoteEditor key={editing.key} {...editorProps} />
    )
  }

  return (
    <div ref={listRef} className="space-y-4">
      <div className={canEdit ? 'flex flex-wrap items-center gap-2' : 'hidden'}>
        <button
          type="button"
          data-new-note
          aria-expanded={choosing}
          aria-controls="new-note-choices"
          onClick={() => setChoosing((v) => !v)}
          className={`${primaryButtonInline} inline-flex items-center gap-2`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('courses.notes.new')}
        </button>
        {choosing && (
          <div
            id="new-note-choices"
            ref={choicesRef}
            role="group"
            aria-label={t('courses.notes.chooseKind')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setChoosing(false)
                listRef.current?.querySelector<HTMLElement>('[data-new-note]')?.focus()
              }
            }}
            className="flex gap-2"
          >
            {(['text', 'drawing'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => open(null, kind)}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-card px-4 font-medium hover:bg-surface"
              >
                <NoteIcon drawing={kind === 'drawing'} />
                {kind === 'drawing' ? t('courses.notes.draw') : t('courses.notes.type')}
              </button>
            ))}
          </div>
        )}
      </div>

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

// one note's card with a preview
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
  const canEdit = useCourseCanEdit()
  const canDownload = useCourseCanDownloadNotes()
  const isDrawing = note.kind === 'drawing'
  const lines = isDrawing ? [] : note.content.split('\n').filter((line) => line.trim())
  // without a title, the first line stands in for it and the preview starts after it
  const title = note.title || lines[0] || (isDrawing ? t('courses.notes.untitledDrawing') : t('courses.notes.untitled'))
  const preview = (note.title ? lines : lines.slice(1)).slice(0, 3)

  // deletes the note
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
      {isDrawing && (
        <span className="mt-2 block">
          <DrawingThumbnail content={note.content} />
        </span>
      )}
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
      <button type="button" data-note-id={note.id} onClick={onOpen} className="flex min-h-24 flex-1 flex-col rounded-t-2xl p-4 pb-2 text-start">
        {body}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-x-2 px-4 pb-2">
        <span className="text-xs text-muted">
          {t('courses.notes.updated', { when: formatRelative(parseServerDate(note.updated_at), i18n.language) })}
        </span>
        {(canEdit || canDownload) && (
          <div className="-me-2 flex flex-wrap items-center">
            {canDownload && (
              <NoteDownloadButton
                drawing={isDrawing}
                onDownload={() => downloadNote(note, { text: t('courses.notes.untitled'), drawing: t('courses.notes.untitledDrawing') })}
              />
            )}
            {canEdit && <DeleteButton question={t('courses.notes.confirmDelete')} onConfirm={remove} />}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  )
}

// the typed or drawn note icon
function NoteIcon({ drawing }: { drawing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {drawing ? <path d="m15 5 4 4L8 20H4v-4L15 5Z" /> : <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" />}
    </svg>
  )
}

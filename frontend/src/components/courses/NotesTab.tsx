import { useTranslation } from 'react-i18next'

import type { CourseNote } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../dates'

// The course's notes, newest change first. Read-only until the note editors arrive.
export function NotesTab({ notes }: { notes: CourseNote[] }) {
  const { t, i18n } = useTranslation()

  if (notes.length === 0) {
    return <p className="py-8 text-center text-muted">{t('courses.notes.empty')}</p>
  }

  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
      {notes.map((note) => {
        const firstLine = note.kind === 'text' ? note.content.split('\n').find((line) => line.trim()) : null
        return (
          <li key={note.id} className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-muted">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {note.kind === 'drawing' ? (
                  <path d="m15 5 4 4L8 20H4v-4L15 5Z" />
                ) : (
                  <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" />
                )}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate font-medium">
                {note.title || firstLine || (note.kind === 'drawing' ? t('courses.notes.untitledDrawing') : t('courses.notes.untitled'))}
              </p>
              <p className="text-sm text-muted">
                <span className="sr-only">{note.kind === 'drawing' ? t('courses.notes.drawing') : t('courses.notes.text')}, </span>
                {t('courses.notes.updated', { when: formatRelative(parseServerDate(note.updated_at), i18n.language) })}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

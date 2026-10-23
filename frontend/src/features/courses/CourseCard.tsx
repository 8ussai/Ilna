import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { COURSE_TITLE_MAX } from '../../api/courses'
import type { CourseColor, CourseSummary } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../lib/dates'
import { inAppClick } from '../../lib/links'
import { coursePath } from '../../lib/tabs'
import { Dialog } from '../../components/Dialog'
import { Field } from '../../components/Field'
import { UserName } from '../account/Premium'
import { dangerButtonInline, primaryButtonInline, secondaryButtonInline } from '../../components/styles'
import { CourseLookPicker } from './CourseLookPicker'
import { courseColorClass } from './courseColors'

type CourseCardProps = {
  course: CourseSummary
  onOpen: () => void
  onUpdate: (changes: { title?: string; color?: CourseColor | null }) => Promise<void>
  onDelete: () => Promise<void>
  // an added course: taken off the list, not deleted
  onLeave: () => Promise<void>
}

type OpenDialog = 'rename' | 'look' | 'delete' | 'leave' | null

// one course in the grid, with its menu and dialogs
export function CourseCard({ course, onOpen, onUpdate, onDelete, onLeave }: CourseCardProps) {
  const { t, i18n } = useTranslation()
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const counts = [
    t('courses.counts.files', { count: course.documents_count }),
    t('courses.counts.recordings', { count: course.audio_count }),
    t('courses.counts.links', { count: course.links_count }),
    t('courses.counts.notes', { count: course.notes_count }),
  ].filter((_, i) => [course.documents_count, course.audio_count, course.links_count, course.notes_count][i] > 0)

  const opened = course.last_opened_at ? parseServerDate(course.last_opened_at) : null
  const created = parseServerDate(course.created_at)

  return (
    // no overflow-hidden here: the ⋯ menu has to reach past the card's edge, so the color bar rounds itself
    <article className="relative flex flex-col rounded-2xl border border-line bg-card hover:border-muted/50">
      <div aria-hidden="true" className={`h-2 shrink-0 rounded-t-[15px] ${courseColorClass(course.color)}`} />
      <a href={coursePath(course.id)} onClick={inAppClick(onOpen)} className="flex flex-1 flex-col p-4 pe-14 sm:p-5 sm:pe-14">
        <div className="flex items-center gap-3">
          <h2 dir="auto" className="min-w-0 break-words text-lg font-semibold leading-snug">
            {course.title}
          </h2>
        </div>
        {course.description && (
          <p dir="auto" className="mt-2 line-clamp-2 text-sm text-muted">
            {course.description}
          </p>
        )}
        {!course.is_owner && course.owner && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{t('courses.shared.tag')}</span>
            <span className="min-w-0 truncate">
              {t('courses.shared.by')} <UserName user={course.owner} />
            </span>
          </p>
        )}
        {course.is_owner && course.is_public && (
          <p className="mt-2">
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">{t('courses.share.public')}</span>
          </p>
        )}
        <p className="mt-auto pt-4 text-sm text-muted">{counts.length > 0 ? counts.join(' · ') : t('courses.counts.empty')}</p>
        <p className="mt-1 text-xs text-muted">
          {opened
            ? t('courses.opened', { when: formatRelative(opened, i18n.language) })
            : t('courses.created', { when: formatRelative(created, i18n.language) })}
        </p>
      </a>

      <CardMenu
        courseTitle={course.title}
        items={
          course.is_owner
            ? [
                [t('courses.menu.rename'), () => setDialog('rename')],
                [t('courses.menu.look'), () => setDialog('look')],
                [t('courses.menu.delete'), () => setDialog('delete'), true],
              ]
            : [[t('courses.shared.leave'), () => setDialog('leave'), true]]
        }
      />
      {dialog === 'leave' && <LeaveDialog course={course} onClose={() => setDialog(null)} onLeave={onLeave} />}

      {dialog === 'rename' && (
        <RenameDialog title={course.title} onClose={() => setDialog(null)} onSave={(title) => onUpdate({ title })} />
      )}
      {dialog === 'look' && (
        <LookDialog course={course} onClose={() => setDialog(null)} onSave={(color) => onUpdate({ color })} />
      )}
      {dialog === 'delete' && <DeleteDialog course={course} onClose={() => setDialog(null)} onDelete={onDelete} />}
    </article>
  )
}

// label, action, and whether it's the destructive one
type MenuItem = [string, () => void, boolean?]

// the ⋯ menu on a course card
function CardMenu({ courseTitle, items }: { courseTitle: string; items: MenuItem[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    // closes the menu on a click outside it
    function onPointer(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // arrow keys move through the menu, Esc closes it
  function onMenuKey(e: KeyboardEvent<HTMLUListElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  // the dialog that opens returns focus to the menu button when it closes
  function choose(action: () => void) {
    setOpen(false)
    buttonRef.current?.focus()
    action()
  }

  return (
    <div className="absolute end-2 top-4">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('courses.menu.label', { title: courseTitle })}
        onClick={() => setOpen((v) => !v)}
        className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <ul
          ref={menuRef}
          role="menu"
          aria-label={t('courses.menu.label', { title: courseTitle })}
          onKeyDown={onMenuKey}
          className="absolute end-0 top-10 z-20 w-48 rounded-xl border border-line bg-card p-1 shadow-lg"
        >
          {items.map(([label, action, danger]) => (
            <li key={label} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => choose(action)}
                className={`w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-surface focus:bg-surface focus:outline-none ${danger ? 'text-danger' : ''}`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// shared by the three dialogs: runs the save, keeps the dialog open with an error if it fails
function useSave(onClose: () => void) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // runs a save, showing it's busy and any error, and closes on success
  async function run(save: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await save()
      onClose()
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return { busy, error, run }
}

// a dialog's Cancel and submit buttons
function DialogButtons({ busy, submitLabel, onCancel, danger }: { busy: boolean; submitLabel: string; onCancel: () => void; danger?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" onClick={onCancel} className={secondaryButtonInline}>
        {t('feed.cancel')}
      </button>
      <button type="submit" disabled={busy} className={danger ? dangerButtonInline : primaryButtonInline}>
        {busy ? t('auth.working') : submitLabel}
      </button>
    </div>
  )
}

// renaming a course
function RenameDialog({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (title: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(title)
  const [fieldError, setFieldError] = useState('')
  const { busy, error, run } = useSave(onClose)

  // saves the new title
  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setFieldError(t('errors.required'))
      return
    }
    if (trimmed === title) {
      onClose()
      return
    }
    run(() => onSave(trimmed))
  }

  return (
    <Dialog title={t('courses.menu.rename')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          label={t('courses.form.name')}
          value={value}
          maxLength={COURSE_TITLE_MAX}
          dir="auto"
          error={fieldError}
          onChange={(e) => {
            setValue(e.target.value)
            setFieldError('')
          }}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogButtons busy={busy} submitLabel={t('courses.form.save')} onCancel={onClose} />
      </form>
    </Dialog>
  )
}

// changing a course's color
function LookDialog({
  course,
  onClose,
  onSave,
}: {
  course: CourseSummary
  onClose: () => void
  onSave: (color: CourseColor | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const [color, setColor] = useState(course.color)
  const { busy, error, run } = useSave(onClose)

  // saves the color
  function submit(e: FormEvent) {
    e.preventDefault()
    run(() => onSave(color))
  }

  return (
    <Dialog title={t('courses.menu.look')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <CourseLookPicker color={color} onColorChange={setColor} />
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogButtons busy={busy} submitLabel={t('courses.form.save')} onCancel={onClose} />
      </form>
    </Dialog>
  )
}

// confirming taking an added course off the list
function LeaveDialog({ course, onClose, onLeave }: { course: CourseSummary; onClose: () => void; onLeave: () => Promise<void> }) {
  const { t } = useTranslation()
  const { busy, error, run } = useSave(onClose)

  return (
    <Dialog title={t('courses.shared.leave')} onClose={onClose} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(onLeave)
        }}
      >
        <p>
          <bdi dir="auto" className="font-semibold">{course.title}</bdi>
        </p>
        <p className="mt-2 text-sm text-muted">{t('courses.shared.leaveConfirm')}</p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogButtons busy={busy} submitLabel={t('courses.shared.leave')} onCancel={onClose} danger />
      </form>
    </Dialog>
  )
}

// confirming deleting a course
function DeleteDialog({ course, onClose, onDelete }: { course: CourseSummary; onClose: () => void; onDelete: () => Promise<void> }) {
  const { t } = useTranslation()
  const { busy, error, run } = useSave(onClose)
  const files = course.documents_count + course.audio_count

  return (
    <Dialog title={t('courses.delete.title')} onClose={onClose} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(onDelete)
        }}
      >
        <p>
          {t('courses.delete.question')} <bdi dir="auto" className="font-semibold">{course.title}</bdi>
        </p>
        <p className="mt-2 text-sm text-muted">
          {files > 0 ? t('courses.delete.withFiles', { count: files }) : t('courses.delete.noFiles')}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogButtons busy={busy} submitLabel={t('courses.delete.confirm')} onCancel={onClose} danger />
      </form>
    </Dialog>
  )
}

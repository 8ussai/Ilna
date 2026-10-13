import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { COURSE_TITLE_MAX } from '../../api/courses'
import type { CourseColor, CourseSummary } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../dates'
import { inAppClick } from '../../links'
import { coursePath } from '../../tabs'
import { Dialog } from '../Dialog'
import { Field } from '../Field'
import { dangerButtonInline, primaryButtonInline, secondaryButtonInline } from '../styles'
import { CourseLookPicker } from './CourseLookPicker'
import { courseColorClass, isSingleEmoji } from './courseColors'

type CourseCardProps = {
  course: CourseSummary
  onOpen: () => void
  onUpdate: (changes: { title?: string; color?: CourseColor | null; emoji?: string | null }) => Promise<void>
  onDelete: () => Promise<void>
}

type OpenDialog = 'rename' | 'look' | 'delete' | null

export function CourseCard({ course, onOpen, onUpdate, onDelete }: CourseCardProps) {
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
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card hover:border-muted/50">
      <div aria-hidden="true" className={`h-2 shrink-0 ${courseColorClass(course.color)}`} />
      <a href={coursePath(course.id)} onClick={inAppClick(onOpen)} className="flex flex-1 flex-col p-4 pe-14 sm:p-5 sm:pe-14">
        <div className="flex items-center gap-3">
          {course.emoji && (
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-xl">
              {course.emoji}
            </span>
          )}
          <h2 dir="auto" className="min-w-0 break-words text-lg font-semibold leading-snug">
            {course.title}
          </h2>
        </div>
        {course.description && (
          <p dir="auto" className="mt-2 line-clamp-2 text-sm text-muted">
            {course.description}
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
        onRename={() => setDialog('rename')}
        onChangeLook={() => setDialog('look')}
        onDelete={() => setDialog('delete')}
      />

      {dialog === 'rename' && (
        <RenameDialog title={course.title} onClose={() => setDialog(null)} onSave={(title) => onUpdate({ title })} />
      )}
      {dialog === 'look' && (
        <LookDialog course={course} onClose={() => setDialog(null)} onSave={(color, emoji) => onUpdate({ color, emoji })} />
      )}
      {dialog === 'delete' && <DeleteDialog course={course} onClose={() => setDialog(null)} onDelete={onDelete} />}
    </article>
  )
}

function CardMenu({
  courseTitle,
  onRename,
  onChangeLook,
  onDelete,
}: {
  courseTitle: string
  onRename: () => void
  onChangeLook: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    function onPointer(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

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

  const items: [string, () => void, boolean?][] = [
    [t('courses.menu.rename'), onRename],
    [t('courses.menu.look'), onChangeLook],
    [t('courses.menu.delete'), onDelete, true],
  ]

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

function RenameDialog({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (title: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(title)
  const [fieldError, setFieldError] = useState('')
  const { busy, error, run } = useSave(onClose)

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

function LookDialog({
  course,
  onClose,
  onSave,
}: {
  course: CourseSummary
  onClose: () => void
  onSave: (color: CourseColor | null, emoji: string | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const [color, setColor] = useState(course.color)
  const [emoji, setEmoji] = useState(course.emoji ?? '')
  const [emojiError, setEmojiError] = useState('')
  const { busy, error, run } = useSave(onClose)

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = emoji.trim()
    if (trimmed && !isSingleEmoji(trimmed)) {
      setEmojiError(t('courses.form.emojiInvalid'))
      return
    }
    run(() => onSave(color, trimmed || null))
  }

  return (
    <Dialog title={t('courses.menu.look')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <CourseLookPicker
          color={color}
          emoji={emoji}
          emojiError={emojiError}
          onColorChange={setColor}
          onEmojiChange={(value) => {
            setEmoji(value)
            setEmojiError('')
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

function DeleteDialog({ course, onClose, onDelete }: { course: CourseSummary; onClose: () => void; onDelete: () => Promise<void> }) {
  const { t } = useTranslation()
  const { busy, error, run } = useSave(onClose)
  const files = course.documents_count + course.audio_count

  return (
    <Dialog title={t('courses.delete.title')} onClose={onClose}>
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

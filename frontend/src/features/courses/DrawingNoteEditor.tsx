import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { createNote, deleteNote, NOTE_TITLE_MAX, updateNote } from '../../api/courses'
import type { CourseNote } from '../../api/courses'
import { DeleteButton } from '../../components/DeleteButton'
import { primaryButtonInline, smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { DrawingCanvas } from './DrawingCanvas'
import type { CanvasTool } from './DrawingCanvas'
import { BACKGROUNDS, emptyDrawing, INK_COLORS, MAX_DRAWING_BYTES, parseDrawing, serializeDrawing, SIZES } from './drawing'
import type { Background, Stroke } from './drawing'

// undo steps kept; older ones are dropped
const HISTORY_LIMIT = 200

type DrawingNoteEditorProps = {
  courseId: number
  // null for a new drawing: the first Save creates it
  note: CourseNote | null
  onSaved: (note: CourseNote) => void
  onDeleted: (noteId: number) => void
  onClose: () => void
  // offered on an empty new drawing, for anyone who'd rather (or needs to) type
  onSwitchToText: () => void
}

// Drawings save when Save is pressed, not on every stroke; leaving with changes asks first.
export function DrawingNoteEditor({ courseId, note, onSaved, onDeleted, onClose, onSwitchToText }: DrawingNoteEditorProps) {
  const { t } = useTranslation()
  const [initial] = useState(() => (note ? parseDrawing(note.content) : emptyDrawing()))
  const [title, setTitle] = useState(note?.title ?? '')
  const [background, setBackground] = useState<Background>(initial.background)
  const [strokes, setStrokes] = useState<Stroke[]>(initial.strokes)
  // earlier and undone stroke lists, for undo/redo
  const [past, setPast] = useState<Stroke[][]>([])
  const [future, setFuture] = useState<Stroke[][]>([])
  const [tool, setTool] = useState<CanvasTool>('pen')
  const [color, setColor] = useState<string>(INK_COLORS[0])
  const [size, setSize] = useState<number>(SIZES[1])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // state for rendering; the ref for the save, which can finish after a re-render
  const [noteId, setNoteId] = useState<number | null>(note?.id ?? null)
  const noteIdRef = useRef(noteId)
  const [headerHeight, setHeaderHeight] = useState(0)
  const backgroundId = useId()

  // the toolbar sticks just under the app's own sticky header while the page scrolls
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]')
    if (!header) return
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight))
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  function changeStrokes(next: Stroke[]) {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), strokes])
    setFuture([])
    setStrokes(next)
    setDirty(true)
    setJustSaved(false)
  }

  function undo() {
    if (past.length === 0) return
    setFuture((f) => [strokes, ...f])
    setStrokes(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    setDirty(true)
  }

  function redo() {
    if (future.length === 0) return
    setPast((p) => [...p, strokes])
    setStrokes(future[0])
    setFuture((f) => f.slice(1))
    setDirty(true)
  }

  async function save(): Promise<boolean> {
    const content = serializeDrawing({ ...emptyDrawing(background), strokes })
    if (new Blob([content]).size > MAX_DRAWING_BYTES) {
      setError(t('courses.drawing.tooLarge'))
      return false
    }
    setSaving(true)
    setError('')
    try {
      const cleanTitle = title.trim() || null
      const saved =
        noteIdRef.current === null
          ? await createNote(courseId, { title: cleanTitle, content, kind: 'drawing' })
          : await updateNote(courseId, noteIdRef.current, { title: cleanTitle, content })
      noteIdRef.current = saved.id
      setNoteId(saved.id)
      onSaved(saved)
      setDirty(false)
      setJustSaved(true)
      return true
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('courses.drawing.saveFailed'))
      return false
    } finally {
      setSaving(false)
    }
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

  function requestClose() {
    if (dirty) setLeaving(true)
    else onClose()
  }

  // keyboard shortcuts, read through a ref so the listener is added once
  const actions = useRef({ undo, redo, save })
  useLayoutEffect(() => {
    actions.current = { undo, redo, save }
  })
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      // typing in the title keeps the browser's own text undo
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void actions.current.save()
      } else if (!inField && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) actions.current.redo()
        else actions.current.undo()
      } else if (!inField && key === 'y') {
        e.preventDefault()
        actions.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // closing or reloading the tab with unsaved strokes asks first
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // the same object until the page changes, so typing a title doesn't repaint the canvas
  const drawing = useMemo(() => ({ ...initial, background, strokes }), [initial, background, strokes])
  const isNewAndEmpty = noteId === null && strokes.length === 0 && !title.trim()

  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t('courses.notes.allNotes')}
        </button>
        <p className={`text-sm ${error ? 'text-danger' : 'text-muted'}`} role={error ? 'alert' : undefined}>
          {error || (dirty ? t('courses.drawing.unsaved') : justSaved ? t('courses.notes.saved') : '')}
        </p>
        <div className="ms-auto flex items-center gap-1">
          {!isNewAndEmpty && <DeleteButton question={t('courses.notes.confirmDelete')} onConfirm={remove} />}
          <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={smallPrimaryButton}>
            {saving ? t('courses.notes.saving') : t('courses.form.save')}
          </button>
        </div>
      </div>

      {leaving && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 text-sm">
          <span className="me-auto">{t('courses.drawing.leavePrompt')}</span>
          <button type="button" onClick={async () => (await save()) && onClose()} disabled={saving} className={smallPrimaryButton}>
            {t('courses.drawing.saveAndLeave')}
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-danger hover:bg-bg">
            {t('courses.drawing.discard')}
          </button>
          <button type="button" onClick={() => setLeaving(false)} className={smallSecondaryButton}>
            {t('courses.notes.keepEditing')}
          </button>
        </div>
      )}

      <div className="space-y-3 p-3 sm:p-5">
        <input
          value={title}
          maxLength={NOTE_TITLE_MAX}
          dir="auto"
          aria-label={t('courses.notes.titleLabel')}
          placeholder={t('courses.notes.titlePlaceholder')}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
            setJustSaved(false)
          }}
          className="w-full bg-transparent px-1 font-serif text-2xl font-semibold placeholder:text-muted/60 focus:outline-none!"
        />

        <div
          role="toolbar"
          aria-label={t('courses.drawing.tools')}
          style={{ top: headerHeight }}
          className="sticky z-10 -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line bg-card/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5"
        >
          <ToolGroup label={t('courses.drawing.tool')}>
            {(['pen', 'highlighter', 'eraser'] as const).map((name) => (
              <ToolButton key={name} pressed={tool === name} label={t(`courses.drawing.${name}`)} onClick={() => setTool(name)}>
                <ToolIcon tool={name} />
              </ToolButton>
            ))}
          </ToolGroup>

          <ToolGroup label={t('courses.drawing.color')}>
            {INK_COLORS.map((ink, i) => (
              <button
                key={ink}
                type="button"
                aria-pressed={color === ink}
                aria-label={t(`courses.drawing.colors.${i}`)}
                title={t(`courses.drawing.colors.${i}`)}
                disabled={tool === 'eraser'}
                onClick={() => setColor(ink)}
                className={`grid size-8 place-items-center rounded-full disabled:opacity-40 ${color === ink ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : ''}`}
              >
                <span className="size-5 rounded-full" style={{ background: ink }} />
              </button>
            ))}
          </ToolGroup>

          <ToolGroup label={t('courses.drawing.size')}>
            {SIZES.map((width, i) => (
              <ToolButton
                key={width}
                pressed={size === width}
                label={t(`courses.drawing.sizes.${i}`)}
                disabled={tool === 'eraser'}
                onClick={() => setSize(width)}
              >
                <span className="rounded-full bg-current" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
              </ToolButton>
            ))}
          </ToolGroup>

          <ToolGroup label={t('courses.drawing.history')}>
            <ToolButton label={t('courses.drawing.undo')} onClick={undo} disabled={past.length === 0}>
              <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </ToolButton>
            <ToolButton label={t('courses.drawing.redo')} onClick={redo} disabled={future.length === 0}>
              <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
              </svg>
            </ToolButton>
          </ToolGroup>

          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={backgroundId} className="text-muted">
              {t('courses.drawing.background')}
            </label>
            <select
              id={backgroundId}
              value={background}
              onChange={(e) => {
                setBackground(e.target.value as Background)
                setDirty(true)
                setJustSaved(false)
              }}
              className="h-9 rounded-lg border border-line bg-card px-2"
            >
              {BACKGROUNDS.map((name) => (
                <option key={name} value={name}>
                  {t(`courses.drawing.backgrounds.${name}`)}
                </option>
              ))}
            </select>
          </div>

          <ClearButton disabled={strokes.length === 0} onClear={() => changeStrokes([])} />
        </div>

        <p className="px-1 text-xs text-muted">
          {t('courses.drawing.a11yNote')}
          {isNewAndEmpty && (
            <>
              {' '}
              <button type="button" onClick={onSwitchToText} className="font-medium text-fg underline">
                {t('courses.drawing.typeInstead')}
              </button>
            </>
          )}
        </p>

        <DrawingCanvas
          drawing={drawing}
          tool={tool}
          color={color}
          size={size}
          label={title.trim() ? t('courses.drawing.canvasLabelNamed', { title: title.trim() }) : t('courses.drawing.canvasLabel')}
          onStroke={(stroke) => changeStrokes([...strokes, stroke])}
          onErase={(erased) => changeStrokes(strokes.filter((s) => !erased.includes(s)))}
        />

        {dirty && (
          <div className="flex justify-end">
            <button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonInline}>
              {saving ? t('courses.notes.saving') : t('courses.drawing.saveDrawing')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {children}
    </div>
  )
}

function ToolButton({
  pressed,
  label,
  disabled,
  onClick,
  children,
}: {
  pressed?: boolean
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-lg disabled:opacity-40 ${pressed ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-surface'}`}
    >
      {children}
    </button>
  )
}

function ToolIcon({ tool }: { tool: CanvasTool }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tool === 'pen' && <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />}
      {tool === 'highlighter' && <path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />}
      {tool === 'eraser' && <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19M22 21H7M5 11l9 9" />}
    </svg>
  )
}

// "Clear page" asks once before wiping it (still undoable afterwards)
function ClearButton({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <span className="text-muted">{t('courses.drawing.clearQuestion')}</span>
        <button
          type="button"
          onClick={() => {
            onClear()
            setConfirming(false)
          }}
          className="rounded-md px-2 py-1 font-medium text-danger hover:bg-surface"
        >
          {t('feed.yes')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-muted hover:bg-surface">
          {t('feed.cancel')}
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-danger disabled:opacity-40"
    >
      {t('courses.drawing.clear')}
    </button>
  )
}

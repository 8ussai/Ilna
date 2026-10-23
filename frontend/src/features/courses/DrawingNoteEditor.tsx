import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { createNote, deleteNote, NOTE_TITLE_MAX, updateNote } from '../../api/courses'
import type { CourseNote } from '../../api/courses'
import { DeleteButton } from '../../components/DeleteButton'
import { primaryButtonInline, smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { DrawingCanvas } from './DrawingCanvas'
import type { CanvasTool } from './DrawingCanvas'
import { BACKGROUNDS, emptyDrawing, INK_COLORS, MAX_DRAWING_BYTES, MAX_DRAWING_PAGES, parseDrawing, serializeDrawing, SIZES } from './drawing'
import type { Background, Stroke } from './drawing'
import { NoteDownloadButton } from './NoteDownloadButton'
import { downloadDrawingPdf } from './noteExport'

// undo steps kept; older ones are dropped
const HISTORY_LIMIT = 200

type DrawingNoteEditorProps = {
  courseId: number
  // null for a new drawing: the first Save creates it
  note: CourseNote | null
  onSaved: (note: CourseNote) => void
  onDeleted: (noteId: number) => void
  onClose: () => void
  // switches to read mode; only offered once the drawing exists
  onRead: () => void
  // offered on an empty new drawing, for anyone who'd rather (or needs to) type
  onSwitchToText: () => void
}

// Drawings save when Save is pressed, not on every stroke; leaving with changes asks first.
export function DrawingNoteEditor({ courseId, note, onSaved, onDeleted, onClose, onRead, onSwitchToText }: DrawingNoteEditorProps) {
  const { t } = useTranslation()
  const [initial] = useState(() => (note ? parseDrawing(note.content) : emptyDrawing()))
  const [title, setTitle] = useState(note?.title ?? '')
  const [background, setBackground] = useState<Background>(initial.background)
  // each page's strokes; a page that didn't change keeps the same array, so its canvas doesn't repaint
  const [pages, setPages] = useState<Stroke[][]>(() => initial.pages.map((page) => page.strokes))
  // earlier and undone versions of all the pages, for undo/redo (adding or deleting a page is undoable too)
  const [past, setPast] = useState<Stroke[][][]>([])
  const [future, setFuture] = useState<Stroke[][][]>([])
  const [tool, setTool] = useState<CanvasTool>('pen')
  const [color, setColor] = useState<string>(INK_COLORS[0])
  const [size, setSize] = useState<number>(SIZES[1])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  // where to go once the unsaved-changes question is answered: the notes list or read mode
  const [leaveTo, setLeaveTo] = useState<(() => void) | null>(null)
  // state for rendering; the ref for the save, which can finish after a re-render
  const [noteId, setNoteId] = useState<number | null>(note?.id ?? null)
  const noteIdRef = useRef(noteId)
  const [headerHeight, setHeaderHeight] = useState(0)
  const backgroundId = useId()
  const pageRefs = useRef<(HTMLElement | null)[]>([])
  // a page just added, scrolled to once it's rendered
  const scrollToPageRef = useRef<number | null>(null)

  // the toolbar sticks just under the app's own sticky header while the page scrolls
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]')
    if (!header) return
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight))
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // sets the pages, keeping the old ones for undo
  function changePages(next: Stroke[][]) {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), pages])
    setFuture([])
    setPages(next)
    setDirty(true)
    setJustSaved(false)
  }

  // sets one page's strokes
  function changePage(index: number, strokes: Stroke[]) {
    changePages(pages.map((page, i) => (i === index ? strokes : page)))
  }

  // adds an empty page at the end and scrolls to it
  function addPage() {
    if (pages.length >= MAX_DRAWING_PAGES) return
    changePages([...pages, []])
    scrollToPageRef.current = pages.length
  }

  // removes a page; the last one left can only be cleared
  function deletePage(index: number) {
    if (pages.length <= 1) return
    changePages(pages.filter((_, i) => i !== index))
  }

  // scrolls to a newly added page once it's on the page
  useEffect(() => {
    const index = scrollToPageRef.current
    if (index === null) return
    scrollToPageRef.current = null
    pageRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pages])

  // undoes the last change
  function undo() {
    if (past.length === 0) return
    setFuture((f) => [pages, ...f])
    setPages(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    setDirty(true)
  }

  // redoes the last undone change
  function redo() {
    if (future.length === 0) return
    setPast((p) => [...p, pages])
    setPages(future[0])
    setFuture((f) => f.slice(1))
    setDirty(true)
  }

  // saves the drawing; true when it worked
  async function save(): Promise<boolean> {
    const content = serializeDrawing({ ...emptyDrawing(background), pages: pages.map((strokes) => ({ strokes })) })
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

  // goes on, asking first if there are unsaved changes
  function leave(next: () => void) {
    if (dirty) setLeaveTo(() => next)
    else next()
  }

  // closes, asking first if there are unsaved changes
  function requestClose() {
    leave(onClose)
  }

  // switches to read mode, asking first if there are unsaved changes
  function goRead() {
    leave(onRead)
  }

  // keyboard shortcuts, read through a ref so the listener is added once
  const actions = useRef({ undo, redo, save })
  useLayoutEffect(() => {
    actions.current = { undo, redo, save }
  })
  useEffect(() => {
    // Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes, Ctrl+S saves
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
    // warns before leaving the page with unsaved changes
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const cleanTitle = title.trim()
  const isNewAndEmpty = noteId === null && pages.length === 1 && pages[0].length === 0 && !cleanTitle

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
          {!isNewAndEmpty && (
            // the pages as they are on screen, unsaved changes included
            <NoteDownloadButton
              drawing
              onDownload={() =>
                downloadDrawingPdf(
                  { ...emptyDrawing(background), pages: pages.map((strokes) => ({ strokes })) },
                  cleanTitle,
                  t('courses.notes.untitledDrawing'),
                )
              }
            />
          )}
          {!isNewAndEmpty && <DeleteButton question={t('courses.notes.confirmDelete')} onConfirm={remove} />}
          <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={smallPrimaryButton}>
            {saving ? t('courses.notes.saving') : t('courses.form.save')}
          </button>
        </div>
      </div>

      {leaveTo && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 text-sm">
          <span className="me-auto">{t('courses.drawing.leavePrompt')}</span>
          <button type="button" onClick={async () => (await save()) && leaveTo()} disabled={saving} className={smallPrimaryButton}>
            {t('courses.drawing.saveAndLeave')}
          </button>
          <button type="button" onClick={leaveTo} className="h-9 rounded-lg px-3 text-sm text-danger hover:bg-bg">
            {t('courses.drawing.discard')}
          </button>
          <button type="button" onClick={() => setLeaveTo(null)} className={smallSecondaryButton}>
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

        {pages.map((strokes, index) => {
          const place = { page: index + 1, count: pages.length }
          return (
            // keyed by position: undo restores pages by position, and a canvas only shows the strokes it's given
            <section
              key={index}
              ref={(el) => {
                pageRefs.current[index] = el
              }}
              aria-label={t('courses.drawing.pageOf', place)}
              style={{ scrollMarginTop: headerHeight + 64 }}
              className="space-y-2"
            >
              <div className="flex min-h-8 flex-wrap items-center gap-x-2 px-1">
                {pages.length > 1 && <span className="text-sm text-muted">{t('courses.drawing.pageOf', place)}</span>}
                <div className="ms-auto flex items-center gap-1">
                  <ConfirmButton
                    label={t('courses.drawing.clear')}
                    question={t('courses.drawing.clearQuestion')}
                    disabled={strokes.length === 0}
                    onConfirm={() => changePage(index, [])}
                  />
                  {pages.length > 1 && (
                    <ConfirmButton
                      label={t('courses.drawing.deletePage')}
                      question={t('courses.drawing.deletePageQuestion')}
                      // an empty page goes without asking
                      skipQuestion={strokes.length === 0}
                      onConfirm={() => deletePage(index)}
                    />
                  )}
                </div>
              </div>
              <DrawingCanvas
                background={background}
                strokes={strokes}
                tool={tool}
                color={color}
                size={size}
                label={
                  cleanTitle
                    ? t('courses.drawing.canvasLabelNamed', { ...place, title: cleanTitle })
                    : t('courses.drawing.canvasLabel', place)
                }
                onStroke={(stroke) => changePage(index, [...strokes, stroke])}
                onErase={(erased) => changePage(index, strokes.filter((s) => !erased.includes(s)))}
              />
            </section>
          )
        })}

        <div className="flex flex-col items-center gap-1 py-2">
          <button type="button" onClick={addPage} disabled={pages.length >= MAX_DRAWING_PAGES} className={smallSecondaryButton}>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('courses.drawing.addPage')}
            </span>
          </button>
          {pages.length >= MAX_DRAWING_PAGES && (
            <p className="text-xs text-muted">{t('courses.drawing.pageLimit', { max: MAX_DRAWING_PAGES })}</p>
          )}
        </div>

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

// a labeled group of toolbar buttons
function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {children}
    </div>
  )
}

// one toolbar button
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

// a tool's icon
function ToolIcon({ tool }: { tool: CanvasTool }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tool === 'pen' && <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />}
      {tool === 'highlighter' && <path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />}
      {tool === 'eraser' && <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19M22 21H7M5 11l9 9" />}
    </svg>
  )
}

// a page action (clear, delete) that asks once before running; still undoable afterwards.
// skipQuestion runs it straight away, for when there's nothing to lose
function ConfirmButton({
  label,
  question,
  disabled,
  skipQuestion,
  onConfirm,
}: {
  label: string
  question: string
  disabled?: boolean
  skipQuestion?: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <span className="text-muted">{question}</span>
        <button
          type="button"
          onClick={() => {
            onConfirm()
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
      onClick={() => (skipQuestion ? onConfirm() : setConfirming(true))}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-danger disabled:opacity-40"
    >
      {label}
    </button>
  )
}

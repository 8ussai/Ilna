import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CourseNote } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../lib/dates'
import { LinkifiedText } from '../blog/LinkifiedText'
import { useCourseCanDownloadNotes } from './courseAccess'
import { drawPage, PAGE_HEIGHT, PAGE_WIDTH, parseDrawing } from './drawing'
import type { Background, Stroke } from './drawing'
import { NoteDownloadButton } from './NoteDownloadButton'
import { downloadNote } from './noteExport'
import { useNearScreen } from './useNearScreen'

// A note in read mode: what members of a shared course see, and where the owner's notes open first.
// onEdit is only given to the owner, and adds an Edit button.
export function NoteViewer({ note, onClose, onEdit }: { note: CourseNote; onClose: () => void; onEdit?: () => void }) {
  const { t, i18n } = useTranslation()
  const backRef = useRef<HTMLButtonElement>(null)
  const canDownload = useCourseCanDownloadNotes()
  const isDrawing = note.kind === 'drawing'
  const title = note.title || (isDrawing ? t('courses.notes.untitledDrawing') : t('courses.notes.untitled'))

  useEffect(() => {
    backRef.current?.focus()
  }, [])

  return (
    <article className="space-y-4">
      <button
        ref={backRef}
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {t('courses.tabs.notes')}
      </button>
      <header>
        <h2 dir="auto" className="break-words font-serif text-2xl font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t('courses.notes.updated', { when: formatRelative(parseServerDate(note.updated_at), i18n.language) })}
        </p>
        {(onEdit || canDownload) && (
          <div className="-ms-2 mt-2 flex flex-wrap items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4" />
                </svg>
                {t('courses.notes.edit')}
              </button>
            )}
            {canDownload && (
              <NoteDownloadButton
                drawing={isDrawing}
                onDownload={() => downloadNote(note, { text: t('courses.notes.untitled'), drawing: t('courses.notes.untitledDrawing') })}
              />
            )}
          </div>
        )}
      </header>
      {isDrawing ? (
        <DrawingPages content={note.content} title={title} />
      ) : (
        <div className="rounded-2xl border border-line bg-card p-5">
          {/* each line finds its own direction, as in the editor */}
          {note.content.split('\n').map((line, i) => (
            <p key={i} dir="auto" className="min-h-6 whitespace-pre-wrap break-words">
              <LinkifiedText text={line} />
            </p>
          ))}
        </div>
      )}
    </article>
  )
}

// every page of a drawing as slides side by side: swipe or scroll the row, or use the arrows
function DrawingPages({ content, title }: { content: string; title: string }) {
  const { t } = useTranslation()
  const rowRef = useRef<HTMLDivElement>(null)
  // the row is on screen or close to it
  const near = useNearScreen(rowRef)
  // the note's pages, parsed once
  const drawing = useMemo(() => parseDrawing(content), [content])
  const count = drawing.pages.length
  // the page in view
  const [current, setCurrent] = useState(0)

  // which page is in view, from how far the row is scrolled (scrollLeft is negative in Arabic)
  function onScroll() {
    const row = rowRef.current
    if (!row || row.clientWidth === 0) return
    const index = Math.round(Math.abs(row.scrollLeft) / row.clientWidth)
    setCurrent(Math.min(count - 1, Math.max(0, index)))
  }

  // scrolls the row to a page
  function goTo(index: number) {
    const row = rowRef.current
    const slide = row?.children[index] as HTMLElement | undefined
    if (!row || !slide) return
    row.scrollTo({ left: slide.offsetLeft - row.offsetLeft, behavior: 'smooth' })
  }

  const arrowClass =
    'grid size-9 place-items-center rounded-full text-muted ring-1 ring-line hover:bg-surface hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="space-y-2">
      <div
        ref={rowRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-white ring-1 ring-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {drawing.pages.map((page, index) => (
          <div key={index} className="w-full shrink-0 snap-start snap-always">
            <DrawingPage
              background={drawing.background}
              strokes={page.strokes}
              // only the page in view and its neighbours keep a canvas: each one takes tens of MB
              drawn={near && Math.abs(index - current) <= 1}
              label={t('courses.drawing.canvasLabelNamed', { page: index + 1, count, title })}
            />
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            aria-label={t('courses.drawing.previousPage')}
            className={arrowClass}
          >
            <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <p className="text-sm text-muted" aria-live="polite">
            {t('courses.drawing.pageOf', { page: current + 1, count })}
          </p>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current === count - 1}
            aria-label={t('courses.drawing.nextPage')}
            className={arrowClass}
          >
            <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// one drawn page, scaled to the row's width; the canvas only exists while drawn is true
function DrawingPage({
  background,
  strokes,
  drawn,
  label,
}: {
  background: Background
  strokes: Stroke[]
  drawn: boolean
  label: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    setWidth(box.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(((width * PAGE_HEIGHT) / PAGE_WIDTH) * dpr)
    const scale = (width / PAGE_WIDTH) * dpr
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawPage(ctx, { background, strokes })
  }, [background, strokes, width, drawn])

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={label}
      className="w-full overflow-hidden bg-white"
      style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}
    >
      {drawn && <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />}
    </div>
  )
}

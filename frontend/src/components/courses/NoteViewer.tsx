import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CourseNote } from '../../api/courses'
import { formatRelative, parseServerDate } from '../../dates'
import { LinkifiedText } from '../LinkifiedText'
import { drawPage, PAGE_HEIGHT, PAGE_WIDTH, parseDrawing } from './drawing'

// A note in a course someone else owns: read it, no editing.
export function NoteViewer({ note, onClose }: { note: CourseNote; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const backRef = useRef<HTMLButtonElement>(null)
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
      </header>
      {isDrawing ? (
        <DrawingPage content={note.content} label={title} />
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

// the whole drawn page, scaled to the column's width
function DrawingPage({ content, label }: { content: string; label: string }) {
  const drawing = useMemo(() => parseDrawing(content), [content])
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
    drawPage(ctx, drawing)
  }, [drawing, width])

  return (
    <div ref={boxRef} className="w-full overflow-hidden rounded-2xl ring-1 ring-line" style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}>
      <canvas ref={canvasRef} role="img" aria-label={label} className="h-full w-full" />
    </div>
  )
}

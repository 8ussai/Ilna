import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { drawPage, PAGE_HEIGHT, PAGE_WIDTH, parseDrawing } from './drawing'

// the thumbnail is 16:9, so it shows this much of the page's height
const VIEW_HEIGHT = (PAGE_WIDTH * 9) / 16
// room kept above the first stroke
const VIEW_MARGIN = 120

// A strip of a drawn note's first page, starting just above its first stroke, drawn from the note's JSON;
// a drawing with more pages says how many.
export function DrawingThumbnail({ content }: { content: string }) {
  const { t } = useTranslation()
  // the note's pages, parsed once
  const drawing = useMemo(() => parseDrawing(content), [content])
  const firstPage = drawing.pages[0]
  const pageCount = drawing.pages.length
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  // measured before the first paint, so the card never shows an empty frame
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    setWidth(box.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // where the strip starts: just above the first stroke
  const offsetY = useMemo(() => {
    let top = Infinity
    for (const stroke of firstPage.strokes) for (const [, y] of stroke.points) top = Math.min(top, y)
    if (!Number.isFinite(top)) return 0
    return Math.max(0, Math.min(top - VIEW_MARGIN, PAGE_HEIGHT - VIEW_HEIGHT))
  }, [firstPage])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(((width * 9) / 16) * dpr)
    const scale = (width / PAGE_WIDTH) * dpr
    ctx.setTransform(scale, 0, 0, scale, 0, -offsetY * scale)
    drawPage(ctx, { background: drawing.background, strokes: firstPage.strokes })
  }, [drawing, firstPage, width, offsetY])

  return (
    <div ref={boxRef} className="relative aspect-video w-full overflow-hidden rounded-lg ring-1 ring-line">
      <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />
      {pageCount > 1 && (
        <span className="absolute bottom-1.5 end-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          {t('courses.drawing.pageCount', { count: pageCount })}
        </span>
      )}
    </div>
  )
}

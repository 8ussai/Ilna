import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { drawPage, drawStroke, PAGE_HEIGHT, PAGE_WIDTH, strokeHit } from './drawing'
import type { Background, Point, Stroke, StrokeTool } from './drawing'
import { useNearScreen } from './useNearScreen'

export type CanvasTool = StrokeTool | 'eraser'

type DrawingCanvasProps = {
  // one page of the drawing
  background: Background
  strokes: Stroke[]
  tool: CanvasTool
  color: string
  size: number
  label: string
  onStroke: (stroke: Stroke) => void
  // strokes the eraser touched in one gesture, removed together (one undo step)
  onErase: (strokes: Stroke[]) => void
}

// page units the eraser reaches around the pointer
const ERASER_RADIUS = 14

// One page, scaled to the available width. Finished strokes are painted on the main canvas;
// the stroke being drawn goes on an overlay, so each pointer move repaints one stroke, not the page.
// The canvases exist only while the page is near the screen, so long drawings don't fill memory.
export function DrawingCanvas({ background, strokes, tool, color, size, label, onStroke, onErase }: DrawingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const near = useNearScreen(wrapperRef)
  const mainRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [cssWidth, setCssWidth] = useState(0)

  // the gesture in progress; refs, since pointer moves come far faster than renders
  const liveRef = useRef<{ pointerId: number; stroke: Stroke } | null>(null)
  const erasingRef = useRef<{ pointerId: number; hit: Set<Stroke> } | null>(null)
  const touchesRef = useRef(new Map<number, number>()) // touch pointer -> last clientY, for scrolling
  const penSeenRef = useRef(false)
  const frameRef = useRef(0)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(([entry]) => setCssWidth(entry.contentRect.width))
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  const cssHeight = (cssWidth * PAGE_HEIGHT) / PAGE_WIDTH

  // sizes a canvas for the screen's pixel density and scales it to the page
  function prepare(canvas: HTMLCanvasElement | null) {
    if (!canvas || cssWidth === 0) return null
    const dpr = window.devicePixelRatio || 1
    const width = Math.round(cssWidth * dpr)
    const height = Math.round(cssHeight * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const scale = (cssWidth / PAGE_WIDTH) * dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    return ctx
  }

  // redraws the finished strokes
  function paintMain() {
    const ctx = prepare(mainRef.current)
    if (!ctx) return
    const hidden = erasingRef.current?.hit
    drawPage(ctx, { background, strokes: hidden?.size ? strokes.filter((s) => !hidden.has(s)) : strokes })
  }

  // draws the stroke being made, on its own layer
  function paintOverlay() {
    frameRef.current = 0
    const ctx = prepare(overlayRef.current)
    if (ctx && liveRef.current) drawStroke(ctx, liveRef.current.stroke, false)
  }

  // the painters read the latest props; effects reach them through this ref
  const paintRef = useRef({ paintMain, paintOverlay })
  useLayoutEffect(() => {
    paintRef.current = { paintMain, paintOverlay }
  })

  // a finished stroke now lives on the main canvas, so the overlay is cleared in the same paint
  useEffect(() => {
    paintRef.current.paintMain()
    paintRef.current.paintOverlay()
  }, [background, strokes, cssWidth, near])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  // a page that scrolls far away loses its canvases, and with them the pointer-up of any gesture
  // still on it; forget that gesture so the next one can start
  useEffect(() => {
    if (near) return
    liveRef.current = null
    erasingRef.current = null
    touchesRef.current.clear()
  }, [near])

  // a screen point in page coordinates
  function toPage(e: { clientX: number; clientY: number }): [number, number] {
    const rect = overlayRef.current!.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * PAGE_WIDTH, ((e.clientY - rect.top) / rect.height) * PAGE_HEIGHT]
  }

  // a pointer event as a stroke point, with pressure
  function pointOf(e: PointerEvent | ReactPointerEvent): Point {
    const [x, y] = toPage(e)
    // mouse and finger report 0.5 (or 0); only a pen's pressure means anything
    return [x, y, e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5]
  }

  // erases the strokes under the pointer
  function eraseAt(e: { clientX: number; clientY: number }) {
    const erasing = erasingRef.current
    if (!erasing) return
    const [x, y] = toPage(e)
    let changed = false
    for (const stroke of strokes) {
      if (!erasing.hit.has(stroke) && strokeHit(stroke, x, y, ERASER_RADIUS)) {
        erasing.hit.add(stroke)
        changed = true
      }
    }
    if (changed) paintMain()
  }

  // drops a stroke in progress (e.g. when a second finger starts scrolling)
  function cancelGesture() {
    liveRef.current = null
    if (erasingRef.current) {
      erasingRef.current = null
      paintMain()
    }
    paintOverlay()
  }

  // starts a stroke or an erase; touch is ignored once a pen has been used
  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'pen') penSeenRef.current = true
    if (e.pointerType === 'touch') {
      touchesRef.current.set(e.pointerId, e.clientY)
      // palm rejection: once a pen has been used, fingers only scroll; two fingers always scroll
      if (penSeenRef.current || touchesRef.current.size > 1) {
        if (liveRef.current || erasingRef.current) cancelGesture()
        return
      }
    }
    if (e.button !== 0 || liveRef.current || erasingRef.current) return
    e.preventDefault()
    try {
      // keeps the stroke going if the pointer slides off the page
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // the pointer is already gone (a very quick tap); the stroke still ends on pointerup
    }

    if (tool === 'eraser') {
      erasingRef.current = { pointerId: e.pointerId, hit: new Set() }
      eraseAt(e)
      return
    }
    liveRef.current = { pointerId: e.pointerId, stroke: { tool, color, size, points: [pointOf(e)] } }
    paintOverlay()
  }

  // adds points to the stroke, or erases along the way
  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const touches = touchesRef.current
    if (e.pointerType === 'touch' && touches.has(e.pointerId) && (penSeenRef.current || touches.size > 1)) {
      // scroll by this finger's share of the movement (two fingers each move it half)
      const lastY = touches.get(e.pointerId)!
      touches.set(e.pointerId, e.clientY)
      window.scrollBy(0, -(e.clientY - lastY) / touches.size)
      return
    }
    // the browser batches moves between frames; the coalesced ones keep fast strokes smooth
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    const moves = events.length > 0 ? events : [e.nativeEvent]

    if (erasingRef.current?.pointerId === e.pointerId) {
      for (const move of moves) eraseAt(move)
      return
    }
    const live = liveRef.current
    if (!live || live.pointerId !== e.pointerId) return
    for (const move of moves) live.stroke.points.push(pointOf(move))
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paintOverlay)
  }

  // finishes the stroke
  function onPointerEnd(e: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean) {
    touchesRef.current.delete(e.pointerId)
    const erasing = erasingRef.current
    if (erasing?.pointerId === e.pointerId) {
      if (cancelled || erasing.hit.size === 0) cancelGesture()
      // the erased strokes stay hidden until the parent's update repaints the page without them
      else onErase([...erasing.hit])
      return
    }
    const live = liveRef.current
    if (!live || live.pointerId !== e.pointerId) return
    if (cancelled) {
      cancelGesture()
      return
    }
    liveRef.current = null
    // drawn whole on the overlay until the main canvas repaints with it, so it never blinks
    const ctx = prepare(overlayRef.current)
    if (ctx) drawStroke(ctx, live.stroke)
    onStroke(live.stroke)
  }

  // once the parent removed the erased strokes, forget them
  useEffect(() => {
    if (erasingRef.current && !strokes.some((s) => erasingRef.current!.hit.has(s))) erasingRef.current = null
  }, [strokes])

  return (
    <div ref={wrapperRef} role="img" aria-label={label} className="relative w-full overflow-hidden rounded-lg shadow-sm ring-1 ring-line">
      {/* white while the page is far away; its canvases are made when it comes near */}
      <div style={{ height: cssHeight }} className="bg-white" />
      {near && (
        <>
          <canvas ref={mainRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
          <canvas
            ref={overlayRef}
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerEnd(e, false)}
            onPointerCancel={(e) => onPointerEnd(e, true)}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 h-full w-full touch-none select-none ${tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
          />
        </>
      )}
    </div>
  )
}

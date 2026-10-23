import { getStroke } from 'perfect-freehand'

// A drawn note is JSON in page units (the page is always this size), so it scales to any screen.
export const PAGE_WIDTH = 1600
export const PAGE_HEIGHT = 2200

export type Point = [x: number, y: number, pressure: number]
export type StrokeTool = 'pen' | 'highlighter'
export type Stroke = { tool: StrokeTool; color: string; size: number; points: Point[] }
export type Background = 'blank' | 'lined' | 'grid'
export type Page = { strokes: Stroke[] }
// version 1 had a single `strokes` list; version 2 has pages (parseDrawing reads both)
export type Drawing = { version: 2; width: number; height: number; background: Background; pages: Page[] }

export const BACKGROUNDS: Background[] = ['blank', 'lined', 'grid']
// dark enough to read on the white page in both themes; yellow is mainly for the highlighter
export const INK_COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#eab308'] as const
// pen widths in page units; the highlighter is wider
export const SIZES = [3, 6, 12] as const
const HIGHLIGHTER_SCALE = 4
// the backend's caps (MAX_DRAWING_BYTES, MAX_DRAWING_PAGES)
export const MAX_DRAWING_BYTES = 5_000_000
export const MAX_DRAWING_PAGES = 20

const LINE_GAP = 64
const MARGIN_TOP = 160

// a one-page drawing with nothing on it yet
export function emptyDrawing(background: Background = 'lined'): Drawing {
  return { version: 2, width: PAGE_WIDTH, height: PAGE_HEIGHT, background, pages: [{ strokes: [] }] }
}

// a page's strokes without broken ones (no points)
function cleanStrokes(strokes: unknown): Stroke[] {
  if (!Array.isArray(strokes)) return []
  return strokes.filter((s: Stroke) => Array.isArray(s?.points) && s.points.length > 0)
}

// a stored note's JSON, old one-page or new multi-page; anything unreadable opens as an empty page instead of crashing the editor
export function parseDrawing(content: string): Drawing {
  try {
    const data = JSON.parse(content)
    if (data && (Array.isArray(data.pages) || Array.isArray(data.strokes))) {
      const pages: Page[] = Array.isArray(data.pages)
        ? data.pages.slice(0, MAX_DRAWING_PAGES).map((page: Page) => ({ strokes: cleanStrokes(page?.strokes) }))
        : [{ strokes: cleanStrokes(data.strokes) }]
      return {
        version: 2,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        background: BACKGROUNDS.includes(data.background) ? data.background : 'blank',
        pages: pages.length > 0 ? pages : [{ strokes: [] }],
      }
    }
  } catch {
    // fall through
  }
  return emptyDrawing('blank')
}

// one decimal is far finer than a pixel and keeps a page of handwriting small
export function serializeDrawing(drawing: Drawing) {
  // rounds to one decimal, to keep the saved JSON small
  const round = (n: number) => Math.round(n * 10) / 10
  return JSON.stringify({
    ...drawing,
    pages: drawing.pages.map((page) => ({
      strokes: page.strokes.map((s) => ({ ...s, points: s.points.map(([x, y, p]) => [round(x), round(y), Math.round(p * 100) / 100]) })),
    })),
  })
}

// how thick a stroke is drawn; highlighters are wider
function strokeWidth(stroke: Pick<Stroke, 'tool' | 'size'>) {
  return stroke.tool === 'highlighter' ? stroke.size * HIGHLIGHTER_SCALE : stroke.size
}

// perfect-freehand turns the points into a filled outline; outlines are cached per stroke
const outlines = new WeakMap<Stroke, Path2D>()

// a stroke's outline as a path, cached once it's finished
function outlinePath(stroke: Stroke, last = true) {
  const cached = last ? outlines.get(stroke) : undefined
  if (cached) return cached
  // a real pen reports varying pressure; mouse and finger report a constant, so pressure is simulated from speed
  const hasPressure = stroke.points.some(([, , p]) => p !== 0.5)
  const highlighter = stroke.tool === 'highlighter'
  const outline = getStroke(stroke.points, {
    size: strokeWidth(stroke),
    thinning: highlighter ? 0 : 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !highlighter && !hasPressure,
    last,
  })
  const path = new Path2D()
  if (outline.length > 0) {
    path.moveTo(outline[0][0], outline[0][1])
    for (let i = 1; i < outline.length; i++) {
      // quadratic curves through the midpoints give a smooth edge
      const [x0, y0] = outline[i]
      const [x1, y1] = outline[(i + 1) % outline.length]
      path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
    }
    path.closePath()
  }
  if (last) outlines.set(stroke, path)
  return path
}

// draws in page units; the caller sets the scale on the context
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, last = true) {
  ctx.save()
  ctx.fillStyle = stroke.color
  if (stroke.tool === 'highlighter') {
    // multiply keeps text under the highlighter readable instead of painting over it
    ctx.globalAlpha = 0.35
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.fill(outlinePath(stroke, last))
  ctx.restore()
}

// draws the page's lines, grid or nothing
function drawBackground(ctx: CanvasRenderingContext2D, background: Background) {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  if (background !== 'blank') {
    ctx.strokeStyle = background === 'lined' ? '#c7d7ee' : '#e2e8f0'
    ctx.lineWidth = 2
    ctx.beginPath()
    const startY = background === 'lined' ? MARGIN_TOP : LINE_GAP
    for (let y = startY; y < PAGE_HEIGHT; y += LINE_GAP) {
      ctx.moveTo(0, y)
      ctx.lineTo(PAGE_WIDTH, y)
    }
    if (background === 'grid') {
      for (let x = LINE_GAP; x < PAGE_WIDTH; x += LINE_GAP) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, PAGE_HEIGHT)
      }
    }
    ctx.stroke()
  }
  ctx.restore()
}

// draws one whole page: background, then strokes
export function drawPage(ctx: CanvasRenderingContext2D, drawing: { background: Background; strokes: Stroke[] }) {
  drawBackground(ctx, drawing.background)
  for (const stroke of drawing.strokes) drawStroke(ctx, stroke)
}

// how far a point is from a line segment, for the eraser
function distanceToSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// the eraser removes whole strokes it touches
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number) {
  const reach = radius + strokeWidth(stroke) / 2
  const { points } = stroke
  if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1]) <= reach
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(x, y, points[i - 1], points[i]) <= reach) return true
  }
  return false
}

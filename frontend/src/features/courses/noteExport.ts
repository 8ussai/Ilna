import type { CourseNote } from '../../api/courses'
import { safeFileName, saveBlob } from '../../lib/saveBlob'
import { drawPage, PAGE_HEIGHT, PAGE_WIDTH, parseDrawing } from './drawing'
import type { Drawing } from './drawing'

// A PDF page is A4 wide (in points) and as tall as the drawing's shape, so nothing is cropped or stretched.
const PDF_PAGE_WIDTH = 595.28
const PDF_PAGE_HEIGHT = (PDF_PAGE_WIDTH * PAGE_HEIGHT) / PAGE_WIDTH
// a page is rendered at its full size, about 190 dpi on paper
const JPEG_QUALITY = 0.9

// saves a typed note as a .txt file: the title, a blank line, then the text.
// The byte-order mark makes Notepad and other editors read Arabic as UTF-8.
export function downloadTextNote(title: string, content: string, fallbackName: string) {
  const text = title ? `${title}\n\n${content}` : content
  const blob = new Blob([String.fromCharCode(0xfeff), text.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' })
  saveBlob(blob, `${safeFileName(title, fallbackName)}.txt`)
}

// Saves a drawing as a PDF, one PDF page per drawing page. The PDF library is loaded only now,
// so it doesn't slow down the app for people who never download.
export async function downloadDrawingPdf(drawing: Drawing, title: string, fallbackName: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: [PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT], orientation: 'portrait', compress: true })
  pdf.setProperties({ title: title || fallbackName })

  // one canvas, reused for every page
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_WIDTH
  canvas.height = PAGE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')

  drawing.pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT], 'portrait')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    drawPage(ctx, { background: drawing.background, strokes: page.strokes })
    pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT)
  })

  saveBlob(pdf.output('blob'), `${safeFileName(title, fallbackName)}.pdf`)
}

// downloads a saved note: typed as .txt, drawn as .pdf. Untitled notes are named after their first line
// (as their card shows them) or the "Untitled" name.
export async function downloadNote(note: CourseNote, untitled: { text: string; drawing: string }) {
  if (note.kind === 'drawing') {
    await downloadDrawingPdf(parseDrawing(note.content), note.title ?? '', untitled.drawing)
    return
  }
  const firstLine = note.content.split('\n').find((line) => line.trim()) ?? ''
  downloadTextNote(note.title ?? '', note.content, safeFileName(firstLine, untitled.text))
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// "Download PDF" for a drawing or "Download .txt" for a typed note; shows its own progress and errors.
export function NoteDownloadButton({ drawing, onDownload }: { drawing: boolean; onDownload: () => Promise<void> | void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // makes the file and saves it
  async function download() {
    setBusy(true)
    setFailed(false)
    try {
      await onDownload()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
        </svg>
        {busy ? t('courses.notes.preparing') : drawing ? t('courses.notes.downloadPdf') : t('courses.notes.downloadTxt')}
      </button>
      {failed && (
        <span role="alert" className="text-sm text-danger">
          {t('courses.notes.downloadFailed')}
        </span>
      )}
    </span>
  )
}

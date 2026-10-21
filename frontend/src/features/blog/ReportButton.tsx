import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { REPORT_REASONS, reportContent } from '../../api/reports'
import type { ReportReason } from '../../api/reports'
import { Dialog } from '../../components/Dialog'
import { primaryButtonInline, secondaryButtonInline } from '../../components/styles'

// matches ReportCreate in backend/blog/schemas.py
const MAX_NOTE = 500

// "Report" on someone else's post or reply; only the admin sees reports, never the author.
export function ReportButton({ kind, id }: { kind: 'post' | 'reply'; id: number }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // once sent (or found already sent), the button just says so
  const [done, setDone] = useState(false)

  if (done) {
    return <span className="px-2 py-1 text-sm text-muted">{t('report.sent')}</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
      >
        {t('report.button')}
      </button>
      {open && (
        <ReportDialog
          kind={kind}
          id={id}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            setDone(true)
          }}
        />
      )}
    </>
  )
}

function ReportDialog({ kind, id, onClose, onDone }: { kind: 'post' | 'reply'; id: number; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    if (!reason) return
    setBusy(true)
    try {
      await reportContent(kind, id, reason, note)
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) onDone()
      else if (err instanceof ApiError && err.status === 429) setError(t('report.tooMany'))
      else if (err instanceof ApiError && err.status === 0) setError(t('errors.network'))
      else setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t(kind === 'post' ? 'report.titlePost' : 'report.titleReply')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-muted">{t('report.explain')}</p>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('report.why')}</legend>
          <div className="space-y-2">
            {REPORT_REASONS.map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-surface">
                <input
                  type="radio"
                  name="report-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span>{t(`report.reasons.${value}`)}</span>
              </label>
            ))}
          </div>
          {submitted && !reason && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {t('report.pickReason')}
            </p>
          )}
        </fieldset>
        <div>
          <label htmlFor="report-note" className="mb-1.5 block text-sm font-medium">
            {t('report.note')}
          </label>
          <textarea
            id="report-note"
            dir="auto"
            rows={2}
            maxLength={MAX_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="block w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-fg placeholder:text-muted"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonInline}>
            {t('feed.cancel')}
          </button>
          <button type="submit" disabled={busy} className={primaryButtonInline}>
            {busy ? t('auth.working') : t('report.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { Dialog } from '../../components/Dialog'
import { dangerButtonInline, secondaryButtonInline } from '../../components/styles'

// matches ReasonRequest in backend/admin/schemas.py
const MAX_REASON = 500

// Asks for the reason a student will be told (a ban or a removal), then runs onConfirm with it.
export function ReasonDialog({
  title,
  explain,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string
  explain: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reasonError = !reason.trim()
    ? t('errors.required')
    : reason.trim().length > MAX_REASON
      ? t('admin.reasonTooLong')
      : undefined

  // checks the reason and runs the action
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    if (reasonError) return
    setBusy(true)
    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-muted">{explain}</p>
        <div>
          <label htmlFor="admin-reason" className="mb-1.5 block text-sm font-medium">
            {t('admin.reason')}
          </label>
          <textarea
            id="admin-reason"
            dir="auto"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={submitted && reasonError ? true : undefined}
            className={`block w-full resize-y rounded-lg border bg-card px-3 py-2 text-fg placeholder:text-muted ${
              submitted && reasonError ? 'border-danger' : 'border-line'
            }`}
          />
          {submitted && reasonError && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {reasonError}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonInline}>
            {t('admin.cancel')}
          </button>
          <button type="submit" disabled={busy} className={dangerButtonInline}>
            {busy ? t('auth.working') : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

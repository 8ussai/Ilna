import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// "Delete" (or label) that asks for confirmation inline before calling onConfirm.
export function DeleteButton({ question, onConfirm, label }: { question: string; onConfirm: () => Promise<void>; label?: string }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      // on success the item usually unmounts; on failure let the user try again
      setBusy(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-danger"
      >
        {label ?? t('feed.delete')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-muted">{question}</span>
      <button
        type="button"
        disabled={busy}
        onClick={confirm}
        className="rounded-md px-2 py-1 font-medium text-danger hover:bg-surface disabled:opacity-50"
      >
        {t('feed.yes')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-muted hover:bg-surface disabled:opacity-50"
      >
        {t('feed.cancel')}
      </button>
    </div>
  )
}

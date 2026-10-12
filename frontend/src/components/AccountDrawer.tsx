import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { secondaryButton } from './styles'

type AccountDrawerProps = { open: boolean; onClose: () => void; onLogout: () => void }

// Slides in from the inline-end side (right in English, left in Arabic). Settings come later.
export function AccountDrawer({ open, onClose, onLogout }: AccountDrawerProps) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div inert={!open} className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-250 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-drawer-title"
        className={`absolute inset-y-0 end-0 flex w-full max-w-sm flex-col border-s border-line bg-card shadow-xl transition-transform duration-250 ease-out ${
          open ? 'translate-x-0' : 'ltr:translate-x-full rtl:-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="account-drawer-title" className="font-serif text-xl font-semibold">
            {t('account.title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('account.close')}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5" />
        <div className="border-t border-line p-5">
          <button type="button" onClick={onLogout} className={`${secondaryButton} text-danger`}>
            {t('account.logout')}
          </button>
        </div>
      </aside>
    </div>
  )
}

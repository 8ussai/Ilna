import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

type DialogProps = {
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'lg'
  // true: a card in the middle of the screen on phones too, instead of a sheet at the bottom
  centered?: boolean
}

// A centered modal (a bottom sheet on phones, unless centered): focus stays inside, Esc and the backdrop close it, and focus goes back to
// whatever opened it. Render it only while open.
export function Dialog({ title, onClose, children, size = 'sm', centered = false }: DialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // the keydown listener is added once, so it reads the latest onClose from here
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // the first field if there is one, else the close button
    const first = panel?.querySelector<HTMLElement>('input, textarea, select') ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    // Esc closes; Tab stays inside the dialog
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div className={`fixed inset-0 z-50 flex justify-center sm:items-center sm:p-6 ${centered ? 'items-center p-4' : 'items-end'}`}>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // dvh is the height phones actually show (vh counts the space behind the address bar, which
        // pushed tall dialogs' title and close button off the top); browsers without dvh keep the class's vh
        style={{ maxHeight: '92dvh' }}
        className={`relative flex max-h-[92vh] w-full min-w-0 flex-col border border-line bg-card shadow-xl sm:rounded-2xl ${centered ? 'rounded-2xl' : 'rounded-t-2xl'} ${
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-serif text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('account.close')}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  )
}

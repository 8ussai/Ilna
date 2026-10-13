import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Me } from '../api/auth'
import { inAppClick } from '../links'
import type { DrawerPage } from '../tabs'
import { CountBadge } from './CountBadge'
import { secondaryButton } from './styles'
import { UserAvatar } from './UserAvatar'

type AccountDrawerProps = {
  open: boolean
  me: Me | null
  unreadCount: number
  onClose: () => void
  onOpenPage: (page: DrawerPage) => void
  onOpenSettings: () => void
  onLogout: () => void
}

// Slides in from the inline-end side (right in English, left in Arabic).
export function AccountDrawer({ open, me, unreadCount, onClose, onOpenPage, onOpenSettings, onLogout }: AccountDrawerProps) {
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
        <div className="flex-1 overflow-y-auto p-5">
          {me && (
            <div className="flex flex-col items-center text-center">
              <UserAvatar username={me.username} size={96} />
              <p className="mt-3 text-lg font-semibold">
                {me.first_name} {me.last_name}
              </p>
              <p className="text-sm text-muted">@{me.username}</p>
            </div>
          )}

          <nav aria-label={t('account.menu')} className="mt-6">
            <ul className="space-y-1">
              <DrawerLink page="notifications" onOpen={onOpenPage} label={t('settings.notifications.title')} badge={unreadCount}>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
              </DrawerLink>
              <DrawerLink page="contact" onOpen={onOpenPage} label={t('settings.contact.title')}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </DrawerLink>
            </ul>
          </nav>
        </div>
        <div className="flex flex-col gap-3 border-t border-line p-5">
          <button type="button" onClick={onOpenSettings} className={`${secondaryButton} inline-flex items-center justify-center gap-2`}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
            {t('account.settings')}
          </button>
          <button type="button" onClick={onLogout} className={`${secondaryButton} text-danger`}>
            {t('account.logout')}
          </button>
        </div>
      </aside>
    </div>
  )
}

type DrawerLinkProps = {
  page: DrawerPage
  onOpen: (page: DrawerPage) => void
  label: string
  badge?: number
  // the icon's svg contents
  children: ReactNode
}

function DrawerLink({ page, onOpen, label, badge = 0, children }: DrawerLinkProps) {
  const { t } = useTranslation()
  return (
    <li>
      <a
        href={`/${page}`}
        onClick={inAppClick(() => onOpen(page))}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {children}
        </svg>
        <span className="flex-1">
          {label}
          {badge > 0 && <span className="sr-only">, {t('settings.notifications.unreadCount', { count: badge })}</span>}
        </span>
        <CountBadge count={badge} />
      </a>
    </li>
  )
}

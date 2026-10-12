import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Me } from '../api/auth'
import type { Catalog } from '../api/meta'
import { catalogNames } from '../catalog'
import { ChangePasswordForm } from '../components/ChangePasswordForm'
import { UserAvatar } from '../components/UserAvatar'
import { formatDate, parseServerDate } from '../dates'
import { settingsPath } from '../tabs'
import type { SettingsPage } from '../tabs'

type SettingsProps = {
  page: SettingsPage
  me: Me
  catalog: Catalog | null
  onNavigate: (page: SettingsPage) => void
  onPasswordChanged: () => void
}

const chevron = (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// a real link (so ctrl/cmd-click opens a new tab) that otherwise navigates in place
function PageLink({ page, onNavigate, className, children }: { page: SettingsPage; onNavigate: (page: SettingsPage) => void; className: string; children: ReactNode }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    onNavigate(page)
  }
  return (
    <a href={settingsPath(page)} onClick={onClick} className={className}>
      {children}
    </a>
  )
}

export function Settings({ page, me, catalog, onNavigate, onPasswordChanged }: SettingsProps) {
  const { t } = useTranslation()

  if (page === 'home') {
    return (
      <>
        <h1 className="font-serif text-3xl font-semibold">{t('settings.title')}</h1>
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          <li>
            <PageLink page="account" onNavigate={onNavigate} className="flex items-center gap-4 px-5 py-4 hover:bg-surface">
              <UserAvatar username={me.username} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('settings.account.title')}</span>
                <span className="block text-sm text-muted">{t('settings.account.summary')}</span>
              </span>
              {chevron}
            </PageLink>
          </li>
        </ul>
      </>
    )
  }

  return (
    <>
      <PageLink page="home" onNavigate={onNavigate} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {t('settings.title')}
      </PageLink>
      <AccountPage me={me} catalog={catalog} onPasswordChanged={onPasswordChanged} />
    </>
  )
}

function AccountPage({ me, catalog, onPasswordChanged }: { me: Me; catalog: Catalog | null; onPasswordChanged: () => void }) {
  const { t, i18n } = useTranslation()
  const names = catalogNames(catalog, me, i18n.language)

  const rows: [string, string | undefined][] = [
    [t('auth.firstName'), me.first_name],
    [t('auth.lastName'), me.last_name],
    [t('auth.username'), `@${me.username}`],
    [t('settings.account.email'), me.email],
    [t('auth.country'), names.country],
    [t('auth.university'), names.university],
    [t('auth.college'), names.college],
    [t('auth.major'), names.major],
    [t('settings.account.created'), formatDate(parseServerDate(me.created_at), i18n.language)],
  ]

  return (
    <>
      <h1 className="mt-3 font-serif text-3xl font-semibold">{t('settings.account.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.account.readOnly')}</p>

      <section className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        <div className="flex items-center gap-4 border-b border-line px-5 py-4">
          <UserAvatar username={me.username} size={56} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">
              {me.first_name} {me.last_name}
            </p>
            <p className="truncate text-sm text-muted">@{me.username}</p>
          </div>
        </div>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:gap-4">
              <dt className="text-sm text-muted sm:w-40 sm:shrink-0">{label}</dt>
              <dd className="min-w-0 break-words">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="password-title" className="mt-8 rounded-xl border border-line bg-card p-5">
        <h2 id="password-title" className="mb-4 font-serif text-xl font-semibold">
          {t('settings.password.title')}
        </h2>
        <ChangePasswordForm onChanged={onPasswordChanged} />
      </section>
    </>
  )
}

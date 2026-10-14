import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Me } from '../api/auth'
import { fetchUsage } from '../api/me'
import type { DailyUsage, Usage } from '../api/me'
import type { Catalog } from '../api/meta'
import { formatBytes } from '../bytes'
import { catalogNames } from '../catalog'
import { ChangePasswordForm } from '../components/ChangePasswordForm'
import { secondaryButton } from '../components/styles'
import { UserAvatar } from '../components/UserAvatar'
import { formatDate, formatRelative, parseServerDate } from '../dates'
import { inAppClick } from '../links'
import { settingsPath } from '../tabs'
import { ActivityPage } from './ActivityPage'
import type { SettingsPage } from '../tabs'

type SettingsProps = {
  page: SettingsPage
  me: Me
  catalog: Catalog | null
  onNavigate: (page: SettingsPage) => void
  onPasswordChanged: () => void
  onOpenPost: (postId: number, replyId: number | null) => void
}

const chevron = (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function PageLink({ page, onNavigate, className, children }: { page: SettingsPage; onNavigate: (page: SettingsPage) => void; className: string; children: ReactNode }) {
  return (
    <a href={settingsPath(page)} onClick={inAppClick(() => onNavigate(page))} className={className}>
      {children}
    </a>
  )
}

export function Settings({ page, me, catalog, onNavigate, onPasswordChanged, onOpenPost }: SettingsProps) {
  const { t } = useTranslation()

  if (page === 'home') {
    const row = (target: Exclude<SettingsPage, 'home'>, icon: ReactNode) => (
      <li>
        <PageLink page={target} onNavigate={onNavigate} className="flex items-center gap-4 px-5 py-4 hover:bg-surface">
          {icon}
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t(`settings.${target}.title`)}</span>
            <span className="block text-sm text-muted">{t(`settings.${target}.summary`)}</span>
          </span>
          {chevron}
        </PageLink>
      </li>
    )

    return (
      <>
        <h1 className="font-serif text-3xl font-semibold">{t('settings.title')}</h1>
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {row('account', <UserAvatar username={me.username} size={40} />)}
          {row(
            'activity',
            <RowIcon>
              <path d="M3 12h4l3-8 4 16 3-8h4" />
            </RowIcon>,
          )}
          {row(
            'storage',
            <RowIcon>
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </RowIcon>,
          )}
          {row(
            'policy',
            <RowIcon>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13h6M9 17h6" />
            </RowIcon>,
          )}
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
      {page === 'account' && <AccountPage me={me} catalog={catalog} onPasswordChanged={onPasswordChanged} />}
      {page === 'activity' && <ActivityPage me={me} catalog={catalog} onOpenPost={onOpenPost} />}
      {page === 'storage' && <StoragePage />}
      {page === 'policy' && <PolicyPage />}
    </>
  )
}

function StoragePage() {
  const { t, i18n } = useTranslation()
  const [usage, setUsage] = useState<Usage | null>(null)
  const [failed, setFailed] = useState(false)
  const storage = usage?.storage

  const load = useCallback(() => {
    fetchUsage()
      .then(setUsage)
      .catch(() => setFailed(true))
  }, [])

  function retry() {
    setFailed(false)
    load()
  }

  useEffect(load, [load])

  let content: ReactNode
  if (storage) {
    const { used_bytes: used, limit_bytes: limit } = storage
    const percent = Math.min(100, (used / limit) * 100)
    const usedText = formatBytes(used, i18n.language)
    const limitText = formatBytes(limit, i18n.language)
    content = (
      <>
        <p className="text-2xl font-semibold">
          {t('settings.storage.usedOf', { used: usedText, limit: limitText })}
        </p>
        <div
          role="progressbar"
          aria-label={t('settings.storage.title')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={t('settings.storage.usedOf', { used: usedText, limit: limitText })}
          className="mt-4 h-3 overflow-hidden rounded-full bg-surface"
        >
          {/* a sliver stays visible for tiny non-zero usage */}
          <div
            className={`h-full rounded-full ${percent >= 90 ? 'bg-danger' : 'bg-accent'}`}
            style={{ width: `${used > 0 ? Math.max(percent, 1) : 0}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-muted">
          {used >= limit
            ? t('settings.storage.full')
            : t('settings.storage.left', { left: formatBytes(limit - used, i18n.language) })}
        </p>
      </>
    )
  } else if (failed) {
    content = (
      <div className="text-center">
        <p className="text-muted">{t('settings.storage.loadFailed')}</p>
        <button type="button" onClick={retry} className={`${secondaryButton} mt-4 w-auto`}>
          {t('auth.retry')}
        </button>
      </div>
    )
  } else {
    content = (
      <p className="text-muted" role="status">
        {t('feed.loading')}
      </p>
    )
  }

  return (
    <>
      <h1 className="mt-3 font-serif text-3xl font-semibold">{t('settings.storage.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.storage.description')}</p>
      <section className="mt-6 rounded-xl border border-line bg-card p-5">{content}</section>
      {usage && (
        <section aria-labelledby="ai-usage-title" className="mt-6 rounded-xl border border-line bg-card p-5">
          <h2 id="ai-usage-title" className="font-semibold">
            {t('settings.storage.aiTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t('settings.storage.aiHint', { summaries: usage.summary.limit, quizzes: usage.quiz.limit })}
          </p>
          <dl className="mt-4 divide-y divide-line">
            <DailyUsageRow label={t('settings.storage.summaries')} usage={usage.summary} />
            <DailyUsageRow label={t('settings.storage.quizzes')} usage={usage.quiz} />
          </dl>
        </section>
      )}
    </>
  )
}

function DailyUsageRow({ label, usage }: { label: string; usage: DailyUsage }) {
  const { t, i18n } = useTranslation()
  const full = usage.used >= usage.limit
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt>{label}</dt>
      <dd className="text-end">
        <span className={`font-medium tabular-nums ${full ? 'text-danger' : ''}`}>
          {t('settings.storage.dailyUsed', { used: usage.used, limit: usage.limit })}
        </span>
        {full && usage.frees_at && (
          <span className="block text-sm text-muted">
            {t('settings.storage.nextAt', { when: formatRelative(parseServerDate(usage.frees_at), i18n.language) })}
          </span>
        )}
      </dd>
    </div>
  )
}

// a line icon in a 40px circle, the same footprint as the avatar on the Account row
function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-muted">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  )
}

type PolicySection = { title: string; body: string[] }

// The policy text is hard-coded in the locale files (policy.*) so it's translated with the rest of the app.
function PolicyPage() {
  const { t } = useTranslation()
  const sections = t('policy.sections', { returnObjects: true }) as PolicySection[]

  return (
    <article>
      <h1 className="mt-3 font-serif text-3xl font-semibold">{t('policy.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('policy.updated')}</p>
      <p className="mt-6 leading-relaxed">{t('policy.intro')}</p>
      {sections.map((section, i) => (
        <section key={section.title} className="mt-8">
          <h2 className="font-serif text-xl font-semibold">
            {i + 1}. {section.title}
          </h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="mt-3 leading-relaxed text-fg/90">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
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

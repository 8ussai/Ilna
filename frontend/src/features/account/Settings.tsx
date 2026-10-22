import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_ACCENT, PRESET_NAMES, accentColors, applyAccent, isCustomAccent } from '../../lib/accent'
import type { Me } from '../../api/auth'
import { fetchStorage, setAccentColor } from '../../api/me'
import type { Storage } from '../../api/me'
import type { Catalog } from '../../api/meta'
import { formatBytes } from '../../lib/bytes'
import { catalogNames } from '../../lib/catalog'
import { ChangePasswordForm } from '../auth/ChangePasswordForm'
import { secondaryButton, smallPrimaryButton } from '../../components/styles'
import { goldClass, PremiumCrown, UserName } from './Premium'
import { UserAvatar } from '../../components/UserAvatar'
import { formatDate, parseServerDate } from '../../lib/dates'
import { inAppClick } from '../../lib/links'
import { settingsPath } from '../../lib/tabs'
import { ActivityPage } from './ActivityPage'
import { CREDITS } from './credits'
import type { SettingsPage } from '../../lib/tabs'

type SettingsProps = {
  page: SettingsPage
  me: Me
  catalog: Catalog | null
  onNavigate: (page: SettingsPage) => void
  onPasswordChanged: () => void
  onOpenPost: (postId: number, replyId: number | null) => void
  onMeChange: (me: Me) => void
}

const chevron = (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// a link to a settings page that opens without reloading
function PageLink({ page, onNavigate, className, children }: { page: SettingsPage; onNavigate: (page: SettingsPage) => void; className: string; children: ReactNode }) {
  return (
    <a href={settingsPath(page)} onClick={inAppClick(() => onNavigate(page))} className={className}>
      {children}
    </a>
  )
}

// Settings: the menu, or one of its pages
export function Settings({ page, me, catalog, onNavigate, onPasswordChanged, onOpenPost, onMeChange }: SettingsProps) {
  const { t } = useTranslation()

  if (page === 'home') {
    // one row of the settings menu
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
            'appearance',
            <RowIcon>
              <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z" />
              <circle cx="7.5" cy="11" r="1" />
              <circle cx="10" cy="7" r="1" />
              <circle cx="15" cy="7.5" r="1" />
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
      {page === 'appearance' && <AppearancePage me={me} onMeChange={onMeChange} />}
      {page === 'storage' && <StoragePage />}
      {page === 'policy' && <PolicyPage />}
    </>
  )
}

// Settings > Appearance: theme color presets, and any color for premium
function AppearancePage({ me, onMeChange }: { me: Me; onMeChange: (me: Me) => void }) {
  const { t } = useTranslation()
  const current = me.accent_color ?? DEFAULT_ACCENT
  const [custom, setCustom] = useState(isCustomAccent(me.accent_color) ? me.accent_color : accentColors(current).light.accent)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null)

  // the picker previews before saving; leaving the page puts the saved color back
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  }, [me])
  useEffect(() => () => applyAccent(meRef.current.accent_color, meRef.current.is_premium), [])

  // saves a theme color, putting it back if saving fails
  function save(value: string) {
    setSaving(true)
    setStatus(null)
    applyAccent(value, me.is_premium)
    setAccentColor(value === DEFAULT_ACCENT ? null : value)
      .then((updated) => {
        onMeChange(updated)
        setStatus('saved')
      })
      .catch(() => {
        applyAccent(me.accent_color, me.is_premium)
        setStatus('failed')
      })
      .finally(() => setSaving(false))
  }

  // shows a picked custom color before it's saved
  function preview(value: string) {
    setCustom(value)
    setStatus(null)
    applyAccent(value, true)
  }

  return (
    <>
      <h1 className="mt-3 font-serif text-3xl font-semibold">{t('settings.appearance.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.appearance.description')}</p>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <h2 id="accent-presets" className="font-medium">
          {t('settings.appearance.presets')}
        </h2>
        <div role="radiogroup" aria-labelledby="accent-presets" className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PRESET_NAMES.map((name) => {
            const { light, dark } = accentColors(name)
            const selected = current === name
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={saving}
                onClick={() => !selected && save(name)}
                className="flex flex-col items-center gap-2 rounded-lg p-2 text-sm hover:bg-surface disabled:cursor-wait"
              >
                {/* each swatch shows the shade the current light/dark theme will use */}
                <span
                  style={{ '--sw-l': light.accent, '--sw-d': dark.accent } as CSSProperties}
                  className={`grid size-10 place-items-center rounded-full bg-(--sw-l) [[data-theme=dark]_&]:bg-(--sw-d) ${
                    selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : ''
                  }`}
                >
                  {selected && (
                    <svg viewBox="0 0 24 24" className="size-5 text-white [[data-theme=dark]_&]:text-[#141413]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </span>
                <span className="text-center leading-tight">{t(`settings.appearance.colors.${name}`)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <h2 className="flex items-center gap-2 font-medium">
          {t('settings.appearance.custom')}
          <PremiumCrown />
        </h2>
        {me.is_premium ? (
          <>
            <p className="mt-1 text-sm text-muted">{t('settings.appearance.customHint')}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={custom}
                onChange={(e) => preview(e.target.value)}
                aria-label={t('settings.appearance.custom')}
                className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-card p-1"
              />
              <span dir="ltr" className="font-mono text-sm text-muted">
                {custom}
              </span>
              <button
                type="button"
                onClick={() => save(custom)}
                disabled={saving || custom === me.accent_color}
                className={smallPrimaryButton}
              >
                {t('settings.appearance.useCustom')}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('settings.appearance.customLocked')}</p>
        )}
      </section>

      <p role="status" className={`mt-3 min-h-5 text-sm ${status === 'failed' ? 'text-danger' : 'text-muted'}`}>
        {status === 'saved' && t('settings.appearance.saved')}
        {status === 'failed' && t('settings.appearance.saveFailed')}
      </p>
    </>
  )
}

// Settings > Storage: how much of the limit is used
function StoragePage() {
  const { t, i18n } = useTranslation()
  const [storage, setStorage] = useState<Storage | null>(null)
  const [failed, setFailed] = useState(false)

  // loads the storage numbers
  const load = useCallback(() => {
    fetchStorage()
      .then(setStorage)
      .catch(() => setFailed(true))
  }, [])

  // tries loading again
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
    </>
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
      <Credits />
    </article>
  )
}

// the open-source software, fonts and AI models Ilna is built on (credits.ts)
function Credits() {
  const { t } = useTranslation()
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="font-serif text-xl font-semibold">{t('policy.credits.title')}</h2>
      <p className="mt-3 leading-relaxed text-fg/90">{t('policy.credits.intro')}</p>
      {CREDITS.map((group) => (
        <div key={group.key} className="mt-6">
          <h3 className="font-semibold">{t(`policy.credits.${group.key}`)}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {group.items.map((credit) => (
              <li key={credit.name} dir="ltr" className="text-start">
                <a href={credit.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                  {credit.name}
                </a>{' '}
                <span className="text-muted">
                  · {credit.by} · {credit.license}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

// Settings > Account: the sign-up details and the password form
function AccountPage({ me, catalog, onPasswordChanged }: { me: Me; catalog: Catalog | null; onPasswordChanged: () => void }) {
  const { t, i18n } = useTranslation()
  const names = catalogNames(catalog, me, i18n.language)

  const rows: [string, string | undefined][] = [
    [t('auth.firstName'), me.first_name],
    [t('auth.lastName'), me.last_name],
    [t('auth.username'), `@${me.username}`],
    // a test account's email is a stand-in that's never used
    [t('settings.account.email'), me.is_test ? t('testAccount.noEmail') : me.email],
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
              <UserName user={me} />
            </p>
            <p className={`truncate text-sm ${me.is_premium ? goldClass : 'text-muted'}`}>@{me.username}</p>
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
        {me.is_test ? (
          <p className="text-sm text-muted">{t('testAccount.passwordByAdmin')}</p>
        ) : (
          <ChangePasswordForm onChanged={onPasswordChanged} />
        )}
      </section>
    </>
  )
}

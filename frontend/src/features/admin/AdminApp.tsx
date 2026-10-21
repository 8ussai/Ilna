import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  fetchAdminSession,
  fetchOpenContactCount,
  fetchOpenReportCount,
  getAdminToken,
  setAdminToken,
  setAdminUnauthorizedHandler,
} from '../../api/admin'
import { fetchCatalog } from '../../api/meta'
import type { Catalog } from '../../api/meta'
import { Header } from '../../components/Header'
import { secondaryButtonInline } from '../../components/styles'
import { formatDateTime, parseServerDate } from '../../lib/dates'
import { AdminContact } from './AdminContact'
import { AdminLog } from './AdminLog'
import { AdminLogin } from './AdminLogin'
import { AdminMaintenance } from './AdminMaintenance'
import { useAdminMaintenance } from './useAdminMaintenance'
import { AdminMessages } from './AdminMessages'
import { AdminPosts } from './AdminPosts'
import { AdminCourses } from './AdminCourses'
import { AdminReports } from './AdminReports'
import { AdminUsers } from './AdminUsers'

// the panel's sections
const SECTIONS = ['reports', 'users', 'posts', 'courses', 'messages', 'contact', 'maintenance', 'log'] as const
type Section = (typeof SECTIONS)[number]

// kept in the hash (/admin#posts) so a reload stays on the same section
function sectionFromHash(): Section {
  const hash = window.location.hash.slice(1)
  return (SECTIONS as readonly string[]).includes(hash) ? (hash as Section) : 'reports'
}

// Everything under /admin; it has its own login and ignores whether a student is logged in.
export function AdminApp() {
  const { t, i18n } = useTranslation()
  const [token, setTokenState] = useState<string | null>(getAdminToken)
  const [email, setEmail] = useState('')
  // for showing university and major names
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [section, setSection] = useState<Section>(sectionFromHash)

  // what's waiting, for the badges on the Reports and Contact tabs
  const [waiting, setWaiting] = useState<Partial<Record<Section, number>>>({})
  // for the banner while the site is closed or about to be, and the Maintenance tab
  const maintenance = useAdminMaintenance(!!token)
  const siteStatus = maintenance.status

  // refreshes the waiting counts on the Reports and Contact tabs
  const refreshCounts = useCallback(() => {
    fetchOpenReportCount()
      .then((result) => setWaiting((w) => ({ ...w, reports: result.count })))
      .catch(() => {})
    fetchOpenContactCount()
      .then((result) => setWaiting((w) => ({ ...w, contact: result.count })))
      .catch(() => {})
  }, [])

  // opens a section of the panel and keeps it in the address
  function openSection(next: Section) {
    setSection(next)
    window.history.replaceState(null, '', `/admin#${next}`)
    // a removal on another tab may have settled some reports
    refreshCounts()
  }

  // saves or clears the admin login
  function updateToken(next: string | null) {
    setAdminToken(next)
    setTokenState(next)
    if (!next) setEmail('')
  }

  useEffect(() => {
    // an expired admin login (2 hours) lands back on the login form
    setAdminUnauthorizedHandler(() => updateToken(null))
    return () => setAdminUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    // on a phone the tab row scrolls; keep the open tab in sight (again once the badges widen the tabs)
    document.getElementById(`admin-tab-${section}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [section, token, waiting])

  useEffect(() => {
    // a link to /admin#users, or the hash edited by hand, switches the tab without a reload
    const onHashChange = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!token) return
    // names just fall back to blank if this fails
    fetchCatalog().then(setCatalog).catch(() => {})
    refreshCounts()
    fetchAdminSession()
      .then((session) => setEmail(session.email))
      .catch(() => {
        // a 401 already logged out through the handler; other errors leave the panel up
      })
  }, [token, refreshCounts])

  return (
    <div className="flex min-h-screen flex-col">
      <Header>
        {token && (
          <button type="button" onClick={() => updateToken(null)} className={`${secondaryButtonInline} h-9 px-3 text-sm`}>
            {t('admin.logout')}
          </button>
        )}
      </Header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
        {token ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="font-serif text-3xl font-semibold">{t('admin.title')}</h1>
              {email && (
                <p className="text-sm text-muted">
                  {t('admin.signedInAs')} <span dir="ltr">{email}</span>
                </p>
              )}
            </div>
            {/* the Maintenance tab shows the same, in more detail */}
            {section !== 'maintenance' && siteStatus && siteStatus.state !== 'off' && siteStatus.starts_at && siteStatus.ends_at && (
              <p
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm ${
                  siteStatus.state === 'on' ? 'border-danger/50 bg-danger/5' : 'border-accent/50 bg-accent/5'
                }`}
              >
                {siteStatus.state === 'on'
                  ? t('admin.maintenance.bannerOn', { to: formatDateTime(parseServerDate(siteStatus.ends_at), i18n.language) })
                  : t('admin.maintenance.bannerScheduled', {
                      from: formatDateTime(parseServerDate(siteStatus.starts_at), i18n.language),
                      to: formatDateTime(parseServerDate(siteStatus.ends_at), i18n.language),
                    })}{' '}
                <button type="button" onClick={() => openSection('maintenance')} className="font-medium text-accent hover:underline">
                  {t('admin.maintenance.manage')}
                </button>
              </p>
            )}
            <div role="tablist" aria-label={t('admin.title')} className="relative flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
              {SECTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`admin-tab-${id}`}
                  aria-selected={section === id}
                  aria-controls="admin-section"
                  onClick={() => openSection(id)}
                  className={`h-11 shrink-0 border-b-2 px-4 text-sm font-medium whitespace-nowrap ${
                    section === id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                  }`}
                >
                  {t(`admin.${id}.title`)}
                  {(waiting[id] ?? 0) > 0 && (
                    <span className="ms-2 rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold text-accent-fg">
                      <span className="sr-only">{t(`admin.${id}.openCount`, { count: waiting[id] })}</span>
                      <span aria-hidden="true">{waiting[id]}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="admin-section" aria-labelledby={`admin-tab-${section}`}>
              {section === 'reports' && <AdminReports catalog={catalog} onChanged={refreshCounts} />}
              {section === 'users' && <AdminUsers catalog={catalog} siteClosing={!!siteStatus && siteStatus.state !== 'off'} />}
              {section === 'posts' && <AdminPosts catalog={catalog} />}
              {section === 'courses' && <AdminCourses />}
              {section === 'messages' && <AdminMessages catalog={catalog} />}
              {section === 'contact' && <AdminContact catalog={catalog} onChanged={refreshCounts} />}
              {section === 'maintenance' && <AdminMaintenance maintenance={maintenance} />}
              {section === 'log' && <AdminLog />}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-md">
            <AdminLogin onAuthenticated={updateToken} />
          </div>
        )}
      </main>
    </div>
  )
}

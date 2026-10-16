import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchAdminSession, getAdminToken, setAdminToken, setAdminUnauthorizedHandler } from '../../api/admin'
import { fetchCatalog } from '../../api/meta'
import type { Catalog } from '../../api/meta'
import { Header } from '../../components/Header'
import { secondaryButtonInline } from '../../components/styles'
import { AdminLogin } from './AdminLogin'
import { AdminPosts } from './AdminPosts'
import { AdminUsers } from './AdminUsers'

// the panel's sections; reports, messages and the log join in the next steps
const SECTIONS = ['users', 'posts'] as const
type Section = (typeof SECTIONS)[number]

// kept in the hash (/admin#posts) so a reload stays on the same section
function sectionFromHash(): Section {
  const hash = window.location.hash.slice(1)
  return (SECTIONS as readonly string[]).includes(hash) ? (hash as Section) : 'users'
}

// Everything under /admin; it has its own login and ignores whether a student is logged in.
export function AdminApp() {
  const { t } = useTranslation()
  const [token, setTokenState] = useState<string | null>(getAdminToken)
  const [email, setEmail] = useState('')
  // for showing university and major names
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [section, setSection] = useState<Section>(sectionFromHash)

  function openSection(next: Section) {
    setSection(next)
    window.history.replaceState(null, '', `/admin#${next}`)
  }

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
    if (!token) return
    // names just fall back to blank if this fails
    fetchCatalog().then(setCatalog).catch(() => {})
    fetchAdminSession()
      .then((session) => setEmail(session.email))
      .catch(() => {
        // a 401 already logged out through the handler; other errors leave the panel up
      })
  }, [token])

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
            <div role="tablist" aria-label={t('admin.title')} className="flex gap-1 border-b border-line">
              {SECTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`admin-tab-${id}`}
                  aria-selected={section === id}
                  aria-controls="admin-section"
                  onClick={() => openSection(id)}
                  className={`-mb-px h-11 border-b-2 px-4 text-sm font-medium ${
                    section === id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                  }`}
                >
                  {t(`admin.${id}.title`)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="admin-section" aria-labelledby={`admin-tab-${section}`}>
              {section === 'users' ? <AdminUsers catalog={catalog} /> : <AdminPosts catalog={catalog} />}
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

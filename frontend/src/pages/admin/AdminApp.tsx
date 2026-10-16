import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchAdminSession, getAdminToken, setAdminToken, setAdminUnauthorizedHandler } from '../../api/admin'
import { fetchCatalog } from '../../api/meta'
import type { Catalog } from '../../api/meta'
import { Header } from '../../components/Header'
import { secondaryButtonInline } from '../../components/styles'
import { AdminLogin } from './AdminLogin'
import { AdminUsers } from './AdminUsers'

// Everything under /admin; it has its own login and ignores whether a student is logged in.
export function AdminApp() {
  const { t } = useTranslation()
  const [token, setTokenState] = useState<string | null>(getAdminToken)
  const [email, setEmail] = useState('')
  // for showing university and major names
  const [catalog, setCatalog] = useState<Catalog | null>(null)

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
            {/* posts, reports, messages and the log join this as tabs in the next steps */}
            <h2 className="font-serif text-2xl font-semibold">{t('admin.users.title')}</h2>
            <AdminUsers catalog={catalog} />
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

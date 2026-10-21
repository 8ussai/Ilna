import { useState } from 'react'

import { clearAccent } from './lib/accent'
import { getToken, setToken } from './api/auth'
import { setAuth } from './api/client'
import type { LogoutReason } from './api/client'
import { MaintenanceBypassBanner, MaintenanceWarning } from './features/maintenance/MaintenanceBanners'
import { MaintenancePage } from './features/maintenance/MaintenanceScreen'
import { parseServerDate } from './lib/dates'
import { useMaintenance } from './features/maintenance/maintenance'
import { AdminApp } from './features/admin/AdminApp'
import { Home } from './features/home/Home'
import { Landing } from './features/landing/Landing'
import type { LandingNotice } from './features/landing/Landing'

// the whole app: the admin panel at /admin, the student site everywhere else
export default function App() {
  // /admin has its own login, whether or not a student is logged in here, and stays open during maintenance
  if (isAdminPath()) return <AdminApp />
  return <Site />
}

// the student site: landing page or the logged-in app, or the maintenance page
function Site() {
  const [token, setTokenState] = useState<string | null>(getToken)
  const [notice, setNotice] = useState<LandingNotice | null>(null)
  const { status, serverNow, refresh } = useMaintenance()

  // saves or clears the login and clears any notice
  function updateToken(next: string | null) {
    setToken(next)
    setTokenState(next)
    if (next === null) clearAccent()
    setNotice(null)
  }

  // logs out to the landing page
  function onLogout() {
    // the landing page lives at "/"; don't leave the old page's path (e.g. /general) in the address bar
    window.history.replaceState(null, '', '/')
    updateToken(null)
  }

  // logs out after a password change, with a notice to sign in again
  function onPasswordChanged() {
    // the next sign-in should start on the feed, not back on the settings page
    window.history.replaceState(null, '', '/')
    updateToken(null)
    setNotice('passwordChanged')
  }

  // the server ended the session: expired, banned or turned off
  function onSessionEnded(reason: LogoutReason) {
    updateToken(null)
    // a banned student is told why they were logged out; the suspended email follows
    if (reason === 'suspended') setNotice('suspended')
    else if (reason === 'testOff') setNotice('testOff')
  }

  // set during render so child effects already send the token on their first request
  setAuth(token, token ? onSessionEnded : null)

  // closed: everyone sees the countdown instead of the site. The login is kept, and the page they were on
  // (it's in the address bar) opens again when the site does.
  if (status?.state === 'on' && !status.bypass && status.message && status.ends_at) {
    return <MaintenancePage message={status.message} endsAt={parseServerDate(status.ends_at)} serverNow={serverNow} onReached={refresh} />
  }

  return (
    <>
      {status && <MaintenanceWarning status={status} serverNow={serverNow} />}
      {status && <MaintenanceBypassBanner status={status} />}
      {token ? (
        <Home onLogout={onLogout} onPasswordChanged={onPasswordChanged} />
      ) : (
        <Landing notice={notice} onAuthenticated={updateToken} />
      )}
    </>
  )
}

// whether the address is the admin panel
function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '/admin' || path.startsWith('/admin/')
}

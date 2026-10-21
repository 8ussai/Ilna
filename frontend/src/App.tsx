import { useState } from 'react'

import { clearAccent } from './accent'
import { getToken, setToken } from './api/auth'
import { setAuth } from './api/client'
import type { LogoutReason } from './api/client'
import { MaintenanceBypassBanner, MaintenanceWarning } from './components/MaintenanceBanners'
import { MaintenancePage } from './components/MaintenanceScreen'
import { parseServerDate } from './dates'
import { useMaintenance } from './maintenance'
import { AdminApp } from './pages/admin/AdminApp'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import type { LandingNotice } from './pages/Landing'

export default function App() {
  // /admin has its own login, whether or not a student is logged in here, and stays open during maintenance
  if (isAdminPath()) return <AdminApp />
  return <Site />
}

function Site() {
  const [token, setTokenState] = useState<string | null>(getToken)
  const [notice, setNotice] = useState<LandingNotice | null>(null)
  const { status, serverNow, refresh } = useMaintenance()

  function updateToken(next: string | null) {
    setToken(next)
    setTokenState(next)
    if (next === null) clearAccent()
    setNotice(null)
  }

  function onLogout() {
    // the landing page lives at "/"; don't leave the old page's path (e.g. /general) in the address bar
    window.history.replaceState(null, '', '/')
    updateToken(null)
  }

  function onPasswordChanged() {
    // the next sign-in should start on the feed, not back on the settings page
    window.history.replaceState(null, '', '/')
    updateToken(null)
    setNotice('passwordChanged')
  }

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

function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '/admin' || path.startsWith('/admin/')
}

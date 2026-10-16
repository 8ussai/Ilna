import { useState } from 'react'

import { getToken, setToken } from './api/auth'
import { setAuth } from './api/client'
import { AdminApp } from './pages/admin/AdminApp'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import type { LandingNotice } from './pages/Landing'

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken)
  const [notice, setNotice] = useState<LandingNotice | null>(null)

  function updateToken(next: string | null) {
    setToken(next)
    setTokenState(next)
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

  // /admin has its own login, whether or not a student is logged in here
  if (isAdminPath()) return <AdminApp />

  // set during render so child effects already send the token on their first request
  setAuth(token, token ? () => updateToken(null) : null)

  return token ? (
    <Home onLogout={onLogout} onPasswordChanged={onPasswordChanged} />
  ) : (
    <Landing notice={notice} onAuthenticated={updateToken} />
  )
}

function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '/admin' || path.startsWith('/admin/')
}

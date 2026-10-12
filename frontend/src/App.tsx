import { useState } from 'react'

import { getToken, setToken } from './api/auth'
import { setAuth } from './api/client'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken)

  function updateToken(next: string | null) {
    setToken(next)
    setTokenState(next)
  }

  // set during render so child effects already send the token on their first request
  setAuth(token, token ? () => updateToken(null) : null)

  return token ? <Home onLogout={() => updateToken(null)} /> : <Landing onAuthenticated={updateToken} />
}

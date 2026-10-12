import { useState } from 'react'

import { getToken, setToken } from './api/auth'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken)

  function updateToken(next: string | null) {
    setToken(next)
    setTokenState(next)
  }

  return token ? <Home onLogout={() => updateToken(null)} /> : <Landing onAuthenticated={updateToken} />
}

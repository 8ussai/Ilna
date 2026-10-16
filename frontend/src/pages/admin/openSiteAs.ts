import { enterAsTestUser } from '../../api/admin'
import { setToken } from '../../api/auth'

// Opens the site in a new tab, logged in as the test user, which works while the site is closed.
// The panel and the site share this browser's storage, so it replaces any student login open here.
export async function openSiteAs(userId: number) {
  // opened before waiting on the server, so the browser doesn't treat it as a popup and block it
  const tab = window.open('about:blank', '_blank')
  try {
    const { token } = await enterAsTestUser(userId)
    setToken(token)
    if (tab) tab.location.href = '/'
    else window.location.href = '/'
  } catch (err) {
    tab?.close()
    throw err
  }
}

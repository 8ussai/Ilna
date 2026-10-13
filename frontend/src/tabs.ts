export const TABS = ['general', 'university', 'college', 'major', 'my-courses'] as const
export type Tab = (typeof TABS)[number]

// 'home' is the settings menu itself (/settings); the rest are its sub-pages (/settings/<page>)
export const SETTINGS_PAGES = ['home', 'account', 'activity', 'storage', 'policy'] as const
export type SettingsPage = (typeof SETTINGS_PAGES)[number]

// pages linked from the account drawer, each at /<page>
export const DRAWER_PAGES = ['notifications', 'contact'] as const
export type DrawerPage = (typeof DRAWER_PAGES)[number]

export type Route =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'settings'; page: SettingsPage }
  | { kind: 'drawer'; page: DrawerPage }
  // a single post (/post/<id>); replyId (#reply-<id>) is the reply to scroll to and highlight
  | { kind: 'post'; postId: number; replyId: number | null }

export function tabPath(tab: Tab) {
  return `/${tab}`
}

export function settingsPath(page: SettingsPage) {
  return page === 'home' ? '/settings' : `/settings/${page}`
}

export function postPath(postId: number, replyId: number | null = null) {
  return replyId === null ? `/post/${postId}` : `/post/${postId}#reply-${replyId}`
}

export function routePath(route: Route) {
  if (route.kind === 'tab') return tabPath(route.tab)
  if (route.kind === 'settings') return settingsPath(route.page)
  if (route.kind === 'drawer') return `/${route.page}`
  return postPath(route.postId, route.replyId)
}

// the current URL in the same form routePath produces, for comparing against it
export function currentPath() {
  return window.location.pathname + window.location.hash
}

// "/" and unknown paths land on General; unknown settings pages land on the settings menu
export function routeFromPath(): Route {
  const [first, second] = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (first === 'post' && /^\d+$/.test(second ?? '')) {
    const reply = /^#reply-(\d+)$/.exec(window.location.hash)
    return { kind: 'post', postId: Number(second), replyId: reply ? Number(reply[1]) : null }
  }
  if ((DRAWER_PAGES as readonly string[]).includes(first)) return { kind: 'drawer', page: first as DrawerPage }
  if (first === 'settings') {
    // these used to live under /settings; keep old links working
    if ((DRAWER_PAGES as readonly string[]).includes(second)) return { kind: 'drawer', page: second as DrawerPage }
    const page = (SETTINGS_PAGES as readonly string[]).includes(second) && second !== 'home' ? (second as SettingsPage) : 'home'
    return { kind: 'settings', page }
  }
  return { kind: 'tab', tab: (TABS as readonly string[]).includes(first) ? (first as Tab) : 'general' }
}

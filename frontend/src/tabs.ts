export const TABS = ['general', 'university', 'college', 'major', 'my-courses'] as const
export type Tab = (typeof TABS)[number]

// 'home' is the settings menu itself (/settings); the rest are its sub-pages (/settings/<page>)
export const SETTINGS_PAGES = ['home', 'account', 'policy'] as const
export type SettingsPage = (typeof SETTINGS_PAGES)[number]

export type Route = { kind: 'tab'; tab: Tab } | { kind: 'settings'; page: SettingsPage }

export function tabPath(tab: Tab) {
  return `/${tab}`
}

export function settingsPath(page: SettingsPage) {
  return page === 'home' ? '/settings' : `/settings/${page}`
}

export function routePath(route: Route) {
  return route.kind === 'tab' ? tabPath(route.tab) : settingsPath(route.page)
}

// "/" and unknown paths land on General; unknown settings pages land on the settings menu
export function routeFromPath(): Route {
  const [first, second] = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (first === 'settings') {
    const page = (SETTINGS_PAGES as readonly string[]).includes(second) && second !== 'home' ? (second as SettingsPage) : 'home'
    return { kind: 'settings', page }
  }
  return { kind: 'tab', tab: (TABS as readonly string[]).includes(first) ? (first as Tab) : 'general' }
}

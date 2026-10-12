export const TABS = ['general', 'university', 'college', 'major', 'my-courses'] as const
export type Tab = (typeof TABS)[number]

export function tabPath(tab: Tab) {
  return `/${tab}`
}

// "/" and unknown paths land on General
export function tabFromPath(): Tab {
  const segment = window.location.pathname.replace(/^\/+|\/+$/g, '')
  return (TABS as readonly string[]).includes(segment) ? (segment as Tab) : 'general'
}

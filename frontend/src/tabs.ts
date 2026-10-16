export const TABS = ['general', 'university', 'college', 'major', 'my-courses'] as const
export type Tab = (typeof TABS)[number]

// 'home' is the settings menu itself (/settings); the rest are its sub-pages (/settings/<page>)
const SETTINGS_PAGES = ['home', 'account', 'activity', 'storage', 'policy'] as const
export type SettingsPage = (typeof SETTINGS_PAGES)[number]

// pages linked from the account drawer, each at /<page>
const DRAWER_PAGES = ['notifications', 'contact'] as const
export type DrawerPage = (typeof DRAWER_PAGES)[number]

// the tabs inside a course page, kept in the URL hash (/course/<id>#recordings)
// 'summaries' and 'quizzes' each show once the course has one
export const COURSE_SECTIONS = ['materials', 'recordings', 'links', 'notes', 'summaries', 'quizzes'] as const
export type CourseSection = (typeof COURSE_SECTIONS)[number]

// the tab each kind of AI study item lives in
export const STUDY_SECTIONS = { summary: 'summaries', quiz: 'quizzes' } as const satisfies Record<string, CourseSection>
type StudySection = (typeof STUDY_SECTIONS)[keyof typeof STUDY_SECTIONS]

export type Route =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'settings'; page: SettingsPage }
  | { kind: 'drawer'; page: DrawerPage }
  // a single post (/post/<id>); replyId (#reply-<id>) is the reply to scroll to and highlight
  | { kind: 'post'; postId: number; replyId: number | null }
  // one course's workspace (/course/<id>); null section = the first tab;
  // itemId is a summary or quiz open in its tab (/course/<id>#summaries-<item id>, #quizzes-<item id>)
  | { kind: 'course'; courseId: number; section: CourseSection | null; itemId: number | null }

export function tabPath(tab: Tab) {
  return `/${tab}`
}

export function settingsPath(page: SettingsPage) {
  return page === 'home' ? '/settings' : `/settings/${page}`
}

export function postPath(postId: number, replyId: number | null = null) {
  return replyId === null ? `/post/${postId}` : `/post/${postId}#reply-${replyId}`
}

export function coursePath(courseId: number, section: CourseSection | null = null, itemId: number | null = null) {
  if ((section === 'summaries' || section === 'quizzes') && itemId !== null) return `/course/${courseId}#${section}-${itemId}`
  return section ? `/course/${courseId}#${section}` : `/course/${courseId}`
}

export function routePath(route: Route) {
  if (route.kind === 'tab') return tabPath(route.tab)
  if (route.kind === 'settings') return settingsPath(route.page)
  if (route.kind === 'drawer') return `/${route.page}`
  if (route.kind === 'course') return coursePath(route.courseId, route.section, route.itemId)
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
  if (first === 'course' && /^\d+$/.test(second ?? '')) {
    // the recordings tab used to be #voice; keep old links working
    const hash = window.location.hash === '#voice' ? 'recordings' : window.location.hash.slice(1)
    const item = /^(summaries|quizzes)-(\d+)$/.exec(hash)
    if (item) return { kind: 'course', courseId: Number(second), section: item[1] as StudySection, itemId: Number(item[2]) }
    const section = (COURSE_SECTIONS as readonly string[]).includes(hash) ? (hash as CourseSection) : null
    return { kind: 'course', courseId: Number(second), section, itemId: null }
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

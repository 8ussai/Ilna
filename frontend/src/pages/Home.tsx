import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMe } from '../api/auth'
import type { Me } from '../api/auth'
import { fetchCatalog } from '../api/meta'
import type { Catalog } from '../api/meta'
import type { PostScope } from '../api/posts'
import { catalogNames } from '../catalog'
import { AccountDrawer } from '../components/AccountDrawer'
import { BlogFeed } from '../components/BlogFeed'
import { CountBadge } from '../components/CountBadge'
import { Header } from '../components/Header'
import { secondaryButton } from '../components/styles'
import { TabBar } from '../components/TabBar'
import { UserAvatar } from '../components/UserAvatar'
import { useUnreadCount } from '../hooks/useUnreadCount'
import { currentPath, routeFromPath, routePath } from '../tabs'
import type { CourseSection, Route } from '../tabs'
import { ContactPage } from './ContactPage'
import { CoursePage } from './CoursePage'
import { CoursesPage } from './CoursesPage'
import { NotificationsPage } from './NotificationsPage'
import { PostPage } from './PostPage'
import { Settings } from './Settings'

export function Home({ onLogout, onPasswordChanged }: { onLogout: () => void; onPasswordChanged: () => void }) {
  const { t, i18n } = useTranslation()
  const [route, setRoute] = useState<Route>(routeFromPath)
  const [me, setMe] = useState<Me | null>(null)
  const [meFailed, setMeFailed] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const accountButtonRef = useRef<HTMLButtonElement>(null)
  const { count: unreadCount, setCount: setUnreadCount } = useUnreadCount()

  // stable, since the notifications page reloads whenever this changes
  const onMarkedRead = useCallback(
    (count: number) => setUnreadCount((current) => Math.max(0, current - count)),
    [setUnreadCount],
  )

  const loadMe = useCallback(() => {
    fetchMe()
      .then(setMe)
      .catch(() => setMeFailed(true))
  }, [])

  function retryMe() {
    setMeFailed(false)
    loadMe()
  }

  useEffect(() => {
    loadMe()
    // names are only for headings, so a failure just falls back to generic labels
    fetchCatalog()
      .then(setCatalog)
      .catch(() => {})
  }, [loadMe])

  useEffect(() => {
    const path = routePath(routeFromPath())
    if (currentPath() !== path) window.history.replaceState(null, '', path)
    const onPop = () => setRoute(routeFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(next: Route) {
    const path = routePath(next)
    if (path !== currentPath()) window.history.pushState(null, '', path)
    setRoute(next)
    window.scrollTo({ top: 0 })
  }

  // a tab inside the course page, or a summary or quiz in it: its own history entry (so Back returns to
  // where you were), without scrolling
  function selectCourseSection(courseId: number, section: CourseSection, itemId: number | null = null) {
    const next: Route = { kind: 'course', courseId, section, itemId }
    const path = routePath(next)
    if (path !== currentPath()) window.history.pushState(null, '', path)
    setRoute(next)
  }

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    accountButtonRef.current?.focus()
  }, [])

  // close without returning focus to the avatar, since the page underneath is changing
  function openFromDrawer(next: Route) {
    setDrawerOpen(false)
    navigate(next)
  }

  const openPost = (postId: number, replyId: number | null) => navigate({ kind: 'post', postId, replyId })

  const isCoursesArea = (route.kind === 'tab' && route.tab === 'my-courses') || route.kind === 'course'

  function renderContent() {
    const tab = route.kind === 'tab' ? route.tab : null
    const openCourse = (courseId: number) => navigate({ kind: 'course', courseId, section: null, itemId: null })
    // courses don't need the profile, so they don't wait for it
    if (tab === 'my-courses') return <CoursesPage onOpenCourse={openCourse} />
    if (route.kind === 'course') {
      return (
        <CoursePage
          key={route.courseId}
          courseId={route.courseId}
          section={route.section ?? 'materials'}
          studyItemId={route.itemId}
          onSectionChange={(section, itemId) => selectCourseSection(route.courseId, section, itemId)}
          onBack={() => navigate({ kind: 'tab', tab: 'my-courses' })}
        />
      )
    }

    if (!me) {
      return meFailed ? (
        <div className="py-16 text-center">
          <p className="text-muted">{t('feed.loadFailed')}</p>
          <button type="button" onClick={retryMe} className={`${secondaryButton} mt-4 w-auto`}>
            {t('auth.retry')}
          </button>
        </div>
      ) : (
        <p className="py-16 text-center text-muted" role="status">
          {t('feed.loading')}
        </p>
      )
    }

    if (route.kind === 'settings') {
      return (
        <Settings
          page={route.page}
          me={me}
          catalog={catalog}
          onNavigate={(page) => navigate({ kind: 'settings', page })}
          onPasswordChanged={onPasswordChanged}
          onOpenPost={openPost}
        />
      )
    }

    if (route.kind === 'drawer') {
      return route.page === 'notifications' ? (
        <NotificationsPage onOpenPost={openPost} onMarkedRead={onMarkedRead} />
      ) : (
        <ContactPage email={me.email} />
      )
    }

    if (route.kind === 'post') {
      return <PostPage key={route.postId} postId={route.postId} replyId={route.replyId} userId={me.id} catalog={catalog} />
    }

    // 'my-courses' and courses returned above, so what's left is a blog scope
    const scope = tab as PostScope
    const names = catalogNames(catalog, me, i18n.language)
    const title = scope === 'general' ? t('tabs.general') : (names[scope] ?? t(`tabs.${scope}`))
    return <BlogFeed key={scope} scope={scope} title={title} userId={me.id} catalog={catalog} />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div data-app-header className="sticky top-0 z-30 border-b border-line bg-bg">
        <Header
          onLogoClick={(e) => {
            e.preventDefault()
            navigate({ kind: 'tab', tab: 'general' })
          }}
        >
          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={
              unreadCount > 0
                ? `${t('account.open')}, ${t('settings.notifications.unreadCount', { count: unreadCount })}`
                : t('account.open')
            }
            aria-expanded={drawerOpen}
            title={t('account.open')}
            className={`relative grid size-9 place-items-center rounded-full hover:opacity-90 ${me ? '' : 'bg-accent text-accent-fg'}`}
          >
            <CountBadge count={unreadCount} className="absolute -end-1.5 -top-1.5 z-10 ring-2 ring-bg" />
            {me ? (
              <UserAvatar username={me.username} size={36} />
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            )}
          </button>
        </Header>
        <TabBar
          active={route.kind === 'tab' ? route.tab : route.kind === 'course' ? 'my-courses' : null}
          onSelect={(tab) => navigate({ kind: 'tab', tab })}
        />
      </div>

      {/* the courses grid needs room for three columns; everything else reads better narrow */}
      <main className={`mx-auto w-full flex-1 px-5 py-8 sm:px-8 ${isCoursesArea ? 'max-w-6xl' : 'max-w-3xl'}`}>{renderContent()}</main>

      <AccountDrawer
        open={drawerOpen}
        me={me}
        unreadCount={unreadCount}
        onClose={closeDrawer}
        onOpenPage={(page) => openFromDrawer({ kind: 'drawer', page })}
        onOpenSettings={() => openFromDrawer({ kind: 'settings', page: 'home' })}
        onLogout={onLogout}
      />
    </div>
  )
}

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
import { Header } from '../components/Header'
import { secondaryButton } from '../components/styles'
import { TabBar } from '../components/TabBar'
import { UserAvatar } from '../components/UserAvatar'
import { routeFromPath, routePath } from '../tabs'
import type { Route } from '../tabs'
import { Settings } from './Settings'

export function Home({ onLogout, onPasswordChanged }: { onLogout: () => void; onPasswordChanged: () => void }) {
  const { t, i18n } = useTranslation()
  const [route, setRoute] = useState<Route>(routeFromPath)
  const [me, setMe] = useState<Me | null>(null)
  const [meFailed, setMeFailed] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const accountButtonRef = useRef<HTMLButtonElement>(null)

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
    if (window.location.pathname !== path) window.history.replaceState(null, '', path)
    const onPop = () => setRoute(routeFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(next: Route) {
    const path = routePath(next)
    if (path !== window.location.pathname) window.history.pushState(null, '', path)
    setRoute(next)
    window.scrollTo({ top: 0 })
  }

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    accountButtonRef.current?.focus()
  }, [])

  function openSettings() {
    // close without returning focus to the avatar, since the page underneath is changing
    setDrawerOpen(false)
    navigate({ kind: 'settings', page: 'home' })
  }

  function renderContent() {
    const tab = route.kind === 'tab' ? route.tab : null
    // placeholder until the courses workspace is built
    if (tab === 'my-courses') return null

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
        />
      )
    }

    // 'my-courses' returned above, so what's left is a blog scope
    const scope = tab as PostScope
    const names = catalogNames(catalog, me, i18n.language)
    const title = scope === 'general' ? t('tabs.general') : (names[scope] ?? t(`tabs.${scope}`))
    return <BlogFeed key={scope} scope={scope} title={title} userId={me.id} />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30 border-b border-line bg-bg">
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
            aria-label={t('account.open')}
            aria-expanded={drawerOpen}
            title={t('account.open')}
            className={`grid size-9 place-items-center rounded-full hover:opacity-90 ${me ? '' : 'bg-accent text-accent-fg'}`}
          >
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
        <TabBar active={route.kind === 'tab' ? route.tab : null} onSelect={(tab) => navigate({ kind: 'tab', tab })} />
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8">{renderContent()}</main>

      <AccountDrawer open={drawerOpen} me={me} onClose={closeDrawer} onOpenSettings={openSettings} onLogout={onLogout} />
    </div>
  )
}

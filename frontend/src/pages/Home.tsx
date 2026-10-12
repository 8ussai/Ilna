import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMe } from '../api/auth'
import type { Me } from '../api/auth'
import { fetchCatalog } from '../api/meta'
import type { Catalog, Named } from '../api/meta'
import type { PostScope } from '../api/posts'
import { AccountDrawer } from '../components/AccountDrawer'
import { BlogFeed } from '../components/BlogFeed'
import { Header } from '../components/Header'
import { secondaryButton } from '../components/styles'
import { TabBar } from '../components/TabBar'
import { tabFromPath, tabPath } from '../tabs'
import type { Tab } from '../tabs'

// The user's university/college/major names from the catalog, in the current language.
function scopeNames(catalog: Catalog | null, me: Me, lang: string) {
  const name = (item?: Named) => (item ? (lang === 'ar' ? item.name_ar : item.name_en) : undefined)
  const university = catalog?.countries
    .find((c) => c.id === me.country)
    ?.universities.find((u) => u.id === me.university)
  const college = university?.colleges.find((c) => c.id === me.college)
  const major = college?.majors.find((m) => m.id === me.major)
  return { university: name(university), college: name(college), major: name(major) }
}

export function Home({ onLogout }: { onLogout: () => void }) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>(tabFromPath)
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
    const path = tabPath(tabFromPath())
    if (window.location.pathname !== path) window.history.replaceState(null, '', path)
    const onPop = () => setTab(tabFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function selectTab(next: Tab) {
    if (next !== tab) window.history.pushState(null, '', tabPath(next))
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    accountButtonRef.current?.focus()
  }, [])

  const initials = me ? `${me.first_name[0] ?? ''}${me.last_name[0] ?? ''}`.toUpperCase() : ''

  function renderContent() {
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

    const scope: PostScope = tab
    const names = scopeNames(catalog, me, i18n.language)
    const title = scope === 'general' ? t('tabs.general') : (names[scope] ?? t(`tabs.${scope}`))
    return <BlogFeed key={scope} scope={scope} title={title} userId={me.id} />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30 border-b border-line bg-bg">
        <Header
          onLogoClick={(e) => {
            e.preventDefault()
            selectTab('general')
          }}
        >
          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('account.open')}
            aria-expanded={drawerOpen}
            title={t('account.open')}
            className="grid size-9 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            {initials || (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            )}
          </button>
        </Header>
        <TabBar active={tab} onSelect={selectTab} />
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8">{renderContent()}</main>

      <AccountDrawer open={drawerOpen} onClose={closeDrawer} onLogout={onLogout} />
    </div>
  )
}

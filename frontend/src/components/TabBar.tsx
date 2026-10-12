import { useTranslation } from 'react-i18next'

import { TABS, tabPath } from '../tabs'
import type { Tab } from '../tabs'

// active is null when the page isn't one of the tabs (e.g. settings)
export function TabBar({ active, onSelect }: { active: Tab | null; onSelect: (tab: Tab) => void }) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('app.sections')} className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const current = tab === active
          return (
            <li key={tab} className="shrink-0">
              <a
                href={tabPath(tab)}
                aria-current={current ? 'page' : undefined}
                onClick={(e) => {
                  // let ctrl/cmd-click open a new tab; otherwise switch in place
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  onSelect(tab)
                }}
                className={`block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
                  current ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t(`tabs.${tab}`)}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

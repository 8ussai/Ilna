import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import logo from '../assets/logo.png'
import { applyLang } from '../i18n'
import type { Lang } from '../i18n'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('ilna-theme', theme)
  } catch {
    // storage may be blocked; the choice just won't persist
  }
}

const langButton = 'h-8 min-w-10 rounded-md px-2 text-sm font-medium'

type HeaderProps = {
  // extra controls shown after the language/theme toggles (e.g. the account button)
  children?: ReactNode
  onLogoClick?: (e: MouseEvent<HTMLAnchorElement>) => void
}

export function Header({ children, onLogoClick }: HeaderProps) {
  const { t, i18n } = useTranslation()
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  )
  const lang: Lang = i18n.language === 'ar' ? 'ar' : 'en'

  function changeLang(next: Lang) {
    applyLang(next)
    i18n.changeLanguage(next)
  }

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const themeLabel = theme === 'dark' ? t('header.toLight') : t('header.toDark')

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
      <a href="/" onClick={onLogoClick} className="flex items-center gap-2.5">
        <img src={logo} alt="" className="size-9" />
        <span className="font-serif text-2xl font-semibold uppercase tracking-wide">Ilna</span>
      </a>

      <div className="flex items-center gap-2">
        <div role="group" aria-label={t('header.language')} className="flex rounded-lg border border-line p-0.5">
          <button
            type="button"
            lang="en"
            aria-pressed={lang === 'en'}
            onClick={() => changeLang('en')}
            className={`${langButton} ${lang === 'en' ? 'bg-surface' : 'text-muted'}`}
          >
            EN
          </button>
          <button
            type="button"
            lang="ar"
            aria-pressed={lang === 'ar'}
            onClick={() => changeLang('ar')}
            className={`${langButton} ${lang === 'ar' ? 'bg-surface' : 'text-muted'}`}
          >
            ع
          </button>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
          className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:text-fg"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>

        {children}
      </div>
    </header>
  )
}

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import ar from './locales/ar.json'

export type Lang = 'en' | 'ar'

// sets the page's language and direction, and remembers it
export function applyLang(lang: Lang) {
  const root = document.documentElement
  root.setAttribute('lang', lang)
  root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  try {
    localStorage.setItem('ilna-lang', lang)
  } catch {
    // storage may be blocked; the choice just won't persist
  }
}

// index.html already set <html lang> from storage / browser language before first paint.
const initial: Lang = document.documentElement.lang === 'ar' ? 'ar' : 'en'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

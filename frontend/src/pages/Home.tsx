import { useTranslation } from 'react-i18next'

import { Header } from '../components/Header'
import { secondaryButton } from '../components/styles'

// Temporary page shown after login until the real app screens exist.
export function Home({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-16 sm:px-8">
        <h1 className="font-serif text-4xl font-semibold">{t('home.welcome')}</h1>
        <p className="mt-3 text-lg text-muted">{t('home.soon')}</p>
        <button type="button" onClick={onLogout} className={`${secondaryButton} mt-8 w-auto`}>
          {t('home.logout')}
        </button>
      </main>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { AuthCard } from '../components/AuthCard'
import { Header } from '../components/Header'
import { Intro } from '../components/Intro'

const YEAR = new Date().getFullYear()

export function Landing({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <Intro />
        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <AuthCard onAuthenticated={onAuthenticated} />
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-5 py-6 text-sm text-muted sm:px-8">
        {t('footer', { year: YEAR })}
      </footer>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { AuthCard } from '../components/AuthCard'
import { Header } from '../components/Header'
import { Intro } from '../components/Intro'

const YEAR = new Date().getFullYear()

// a message shown above the sign-in card, e.g. after a password change logs the user out
export type LandingNotice = 'passwordChanged' | 'suspended' | 'testOff'

type LandingProps = { notice: LandingNotice | null; onAuthenticated: (token: string) => void }

export function Landing({ notice, onAuthenticated }: LandingProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <Intro />
        <div className="mx-auto w-full max-w-md lg:max-w-none">
          {notice && (
            <p role="status" className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm">
              {t(`notices.${notice}`)}
            </p>
          )}
          <AuthCard onAuthenticated={onAuthenticated} />
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-5 py-6 text-sm text-muted sm:px-8">
        {t('footer', { year: YEAR })}
      </footer>
    </div>
  )
}

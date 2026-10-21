import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

type Tab = 'login' | 'signup'

export function AuthCard({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('login')

  const tabClass = (active: boolean) =>
    `h-10 flex-1 rounded-md text-sm font-medium ${active ? 'bg-card shadow-sm' : 'text-muted hover:text-fg'}`

  return (
    <div className="w-full rounded-2xl border border-line bg-surface p-5 sm:p-8">
      <div role="tablist" className="mb-6 flex rounded-lg bg-bg p-1">
        {(['login', 'signup'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls="auth-panel"
            onClick={() => setTab(id)}
            className={tabClass(tab === id)}
          >
            {t(`auth.${id}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="auth-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'login' ? (
          <LoginForm onAuthenticated={onAuthenticated} />
        ) : (
          <RegisterForm onAuthenticated={onAuthenticated} />
        )}
      </div>
    </div>
  )
}

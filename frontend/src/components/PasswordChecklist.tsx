import { useTranslation } from 'react-i18next'

import { PASSWORD_RULES } from '../password'

// Live list under a new-password field; each rule turns green once it's met.
export function PasswordChecklist({ password }: { password: string }) {
  const { t } = useTranslation()

  return (
    <ul className="mt-2 space-y-1 text-sm" aria-label={t('auth.passwordRules.title')}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li key={rule.key} className={`flex items-center gap-2 ${met ? 'text-success' : 'text-muted'}`}>
            <span aria-hidden="true" className="w-4 text-center">
              {met ? '✓' : '○'}
            </span>
            <span>{t(`auth.passwordRules.${rule.key}`)}</span>
            <span className="sr-only">{met ? t('auth.passwordRules.met') : t('auth.passwordRules.notMet')}</span>
          </li>
        )
      })}
    </ul>
  )
}

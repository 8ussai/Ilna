import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { Field } from './Field'
import { primaryButton } from './styles'

export function LoginForm({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    if (!identifier.trim() || !password) return

    setBusy(true)
    try {
      onAuthenticated(await login(identifier.trim(), password))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setFormError(t('errors.badLogin'))
      else if (err instanceof ApiError && err.status === 0) setFormError(t('errors.network'))
      else setFormError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">{t('auth.loginTitle')}</h2>

      <Field
        label={t('auth.identifier')}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        autoComplete="username"
        error={submitted && !identifier.trim() ? t('errors.required') : undefined}
      />
      <Field
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        error={submitted && !password ? t('errors.required') : undefined}
      />

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? t('auth.working') : t('auth.submitLogin')}
      </button>
    </form>
  )
}

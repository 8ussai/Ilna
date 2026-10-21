import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { changePassword } from '../../api/auth'
import { ApiError } from '../../api/client'
import { isStrongPassword } from '../../lib/password'
import { Field } from '../../components/Field'
import { PasswordChecklist } from './PasswordChecklist'
import { primaryButton } from '../../components/styles'

// On success the session ends; onChanged logs the user out so they sign in with the new password.
export function ChangePasswordForm({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [currentWrong, setCurrentWrong] = useState(false)
  const [formError, setFormError] = useState('')

  function errors() {
    const required = t('errors.required')
    return {
      current: !current ? required : currentWrong ? t('errors.currentPasswordWrong') : undefined,
      next: !next
        ? required
        : !isStrongPassword(next)
          ? t('errors.passwordWeak')
          : next === current
            ? t('errors.passwordSame')
            : undefined,
      confirm: !confirm ? required : confirm !== next ? t('errors.passwordMismatch') : undefined,
    }
  }

  const e = errors()
  const show = (field: keyof typeof e) => (submitted ? e[field] : undefined)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setFormError('')
    if (e.current || e.next || e.confirm) return

    setBusy(true)
    try {
      await changePassword(current, next)
      onChanged()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setCurrentWrong(true)
      else if (err instanceof ApiError && err.status === 0) setFormError(t('errors.network'))
      else setFormError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field
        label={t('settings.password.current')}
        type="password"
        value={current}
        onChange={(ev) => {
          setCurrent(ev.target.value)
          setCurrentWrong(false)
        }}
        autoComplete="current-password"
        error={show('current')}
      />
      <Field
        label={t('settings.password.new')}
        type="password"
        value={next}
        onChange={(ev) => setNext(ev.target.value)}
        autoComplete="new-password"
        error={show('next')}
      />
      <PasswordChecklist password={next} />
      <Field
        label={t('settings.password.confirm')}
        type="password"
        value={confirm}
        onChange={(ev) => setConfirm(ev.target.value)}
        autoComplete="new-password"
        error={show('confirm')}
      />

      <p className="text-sm text-muted">{t('settings.password.logoutNote')}</p>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <button type="submit" disabled={busy} className={`${primaryButton} sm:w-auto`}>
        {busy ? t('auth.working') : t('settings.password.submit')}
      </button>
    </form>
  )
}

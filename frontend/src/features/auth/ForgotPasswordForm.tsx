import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { forgotPassword, resetPassword } from '../../api/auth'
import { ACCOUNT_SUSPENDED, ApiError } from '../../api/client'
import { isStrongPassword } from '../../lib/password'
import { Field } from '../../components/Field'
import { PasswordChecklist } from './PasswordChecklist'
import { primaryButton, secondaryButtonInline } from '../../components/styles'

// matches OTP_RESEND_COOLDOWN_SECONDS on the backend
const RESEND_COOLDOWN = 60

// "Forgot password?" from the login form: ask for a code, then enter it with a new password.
// Success logs in here; every other session was logged out by the backend.
export function ForgotPasswordForm({
  initialIdentifier,
  onAuthenticated,
  onBack,
}: {
  initialIdentifier: string
  onAuthenticated: (token: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState(initialIdentifier)
  // the email or username the code was asked for; null until then
  const [requested, setRequested] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // emails a reset code to the account's address
  async function onRequest(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    if (!identifier.trim()) return

    setBusy(true)
    try {
      await forgotPassword(identifier.trim())
      setRequested(identifier.trim())
      setSubmitted(false)
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.resetUnavailable'))
    } finally {
      setBusy(false)
    }
  }

  if (requested) {
    return (
      <ResetStep
        identifier={requested}
        onAuthenticated={onAuthenticated}
        onBack={() => setRequested(null)}
      />
    )
  }

  return (
    <form onSubmit={onRequest} noValidate className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">{t('auth.forgotTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('auth.forgotIntro')}</p>
      </div>

      <Field
        label={t('auth.identifier')}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        autoComplete="username"
        error={submitted && !identifier.trim() ? t('errors.required') : undefined}
      />

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? t('auth.working') : t('auth.forgotSend')}
      </button>

      <button type="button" onClick={onBack} className={secondaryButtonInline}>
        {t('auth.back')}
      </button>
    </form>
  )
}

// the second step: the emailed code and a new password
function ResetStep({
  identifier,
  onAuthenticated,
  onBack,
}: {
  identifier: string
  onAuthenticated: (token: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const required = t('errors.required')
  const errors = {
    code: !code ? required : !/^\d{6}$/.test(code) ? t('errors.otpFormat') : undefined,
    password: !password ? required : !isStrongPassword(password) ? t('errors.passwordWeak') : undefined,
    confirm: !confirm ? required : confirm !== password ? t('errors.passwordMismatch') : undefined,
  }
  // a field's error, once the form has been submitted
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined)

  // sets the new password with the code, then logs in
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    setNotice('')
    if (errors.code || errors.password || errors.confirm) return

    setBusy(true)
    try {
      onAuthenticated(await resetPassword(identifier, code, password))
    } catch (err) {
      if (err instanceof ApiError && err.detail === ACCOUNT_SUSPENDED) setFormError(t('errors.suspended'))
      else if (err instanceof ApiError && err.detail === 'Code expired') setFormError(t('errors.otpExpired'))
      else if (err instanceof ApiError && err.detail === 'Too many attempts') setFormError(t('errors.otpTooMany'))
      else if (err instanceof ApiError && err.status === 400) setFormError(t('errors.otpWrong'))
      else if (err instanceof ApiError && err.status === 0) setFormError(t('errors.network'))
      else setFormError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  // emails another reset code
  async function onResend() {
    setFormError('')
    setNotice('')
    try {
      await forgotPassword(identifier)
      setCode('')
      setCooldown(RESEND_COOLDOWN)
      setNotice(t('auth.otpResent'))
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.resetUnavailable'))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">{t('auth.otpTitle')}</h2>
        <p className="mt-1 text-sm text-muted">
          {t('auth.resetSentTo')} <span dir="ltr" className="font-medium text-fg">{identifier}</span>
        </p>
      </div>

      <Field
        label={t('auth.otpCode')}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        className="tracking-[0.5em]"
        hint={t('auth.otpHint')}
        error={show('code')}
      />
      <div>
        <Field
          label={t('settings.password.new')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          error={show('password')}
        />
        <PasswordChecklist password={password} />
      </div>
      <Field
        label={t('settings.password.confirm')}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        error={show('confirm')}
      />

      <p className="text-sm text-muted">{t('auth.resetLogoutNote')}</p>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      )}

      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? t('auth.working') : t('auth.resetSubmit')}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={secondaryButtonInline}>
          {t('auth.back')}
        </button>
        <button type="button" onClick={onResend} disabled={cooldown > 0} className={secondaryButtonInline}>
          {cooldown > 0 ? t('auth.otpResendIn', { seconds: cooldown }) : t('auth.otpResend')}
        </button>
      </div>
    </form>
  )
}

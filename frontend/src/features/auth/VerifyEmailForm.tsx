import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { resendOtp, verifyOtp } from '../../api/auth'
import { ACCOUNT_SUSPENDED, ApiError } from '../../api/client'
import { Field } from '../../components/Field'
import { primaryButton, secondaryButtonInline } from '../../components/styles'

// matches OTP_RESEND_COOLDOWN_SECONDS on the backend
const RESEND_COOLDOWN = 60

// Shown after sign-up, and on login for an account that was never verified; a code was just emailed.
export function VerifyEmailForm({
  email,
  onAuthenticated,
  onBack,
}: {
  email: string
  onAuthenticated: (token: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
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

  const codeError = !code ? t('errors.required') : !/^\d{6}$/.test(code) ? t('errors.otpFormat') : undefined

  // checks the emailed code and logs in
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    setNotice('')
    if (codeError) return

    setBusy(true)
    try {
      onAuthenticated(await verifyOtp(email, code))
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

  // emails another code
  async function onResend() {
    setFormError('')
    setNotice('')
    try {
      await resendOtp(email)
      setCode('')
      setSubmitted(false)
      setCooldown(RESEND_COOLDOWN)
      setNotice(t('auth.otpResent'))
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.otpSendFailed'))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">{t('auth.otpTitle')}</h2>
        <p className="mt-1 text-sm text-muted">
          {t('auth.otpSentTo')} <span dir="ltr" className="font-medium text-fg">{email}</span>
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
        error={submitted ? codeError : undefined}
      />

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
        {busy ? t('auth.working') : t('auth.otpSubmit')}
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

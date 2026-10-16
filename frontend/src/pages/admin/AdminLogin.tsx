import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { requestAdminCode, verifyAdminCode } from '../../api/admin'
import { ApiError } from '../../api/client'
import { Field } from '../../components/Field'
import { primaryButton, secondaryButtonInline } from '../../components/styles'

// matches OTP_RESEND_COOLDOWN_SECONDS on the backend
const RESEND_COOLDOWN = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Email first, then the emailed code; the server answers the same for any email, so the admin email stays secret.
export function AdminLogin({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const emailError = !email.trim() ? t('errors.required') : !EMAIL_RE.test(email.trim()) ? t('errors.emailInvalid') : undefined
  const codeError = !code ? t('errors.required') : !/^\d{6}$/.test(code) ? t('errors.otpFormat') : undefined

  function showError(err: unknown) {
    if (err instanceof ApiError && err.status === 0) setFormError(t('errors.network'))
    else if (err instanceof ApiError && err.status === 503) setFormError(t('admin.login.emailDown'))
    else setFormError(t('errors.generic'))
  }

  async function sendCode() {
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      await requestAdminCode(email.trim())
      setCooldown(RESEND_COOLDOWN)
      return true
    } catch (err) {
      showError(err)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (emailError) return
    if (await sendCode()) {
      setSubmitted(false)
      setStep('code')
    }
  }

  async function onResend() {
    if (await sendCode()) {
      setCode('')
      setSubmitted(false)
      setNotice(t('auth.otpResent'))
    }
  }

  async function onCodeSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    setNotice('')
    if (codeError) return

    setBusy(true)
    try {
      onAuthenticated(await verifyAdminCode(email.trim(), code))
    } catch (err) {
      if (err instanceof ApiError && err.detail === 'Code expired') setFormError(t('errors.otpExpired'))
      else if (err instanceof ApiError && err.detail === 'Too many attempts') setFormError(t('errors.otpTooMany'))
      else if (err instanceof ApiError && err.status === 400) setFormError(t('errors.otpWrong'))
      else showError(err)
    } finally {
      setBusy(false)
    }
  }

  const messages = (
    <>
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
    </>
  )

  return (
    <div className="w-full rounded-2xl border border-line bg-surface p-5 sm:p-8">
      {step === 'email' ? (
        <form onSubmit={onEmailSubmit} noValidate className="space-y-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold">{t('admin.login.title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('admin.login.intro')}</p>
          </div>
          <Field
            label={t('admin.login.email')}
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            error={submitted ? emailError : undefined}
          />
          {messages}
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? t('auth.working') : t('admin.login.sendCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit} noValidate className="space-y-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold">{t('auth.otpTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('admin.login.codeSent')}</p>
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
          {messages}
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? t('auth.working') : t('admin.login.signIn')}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (setStep('email'), setCode(''), setSubmitted(false), setFormError(''), setNotice(''))}
              className={secondaryButtonInline}
            >
              {t('auth.back')}
            </button>
            <button type="button" onClick={onResend} disabled={busy || cooldown > 0} className={secondaryButtonInline}>
              {cooldown > 0 ? t('auth.otpResendIn', { seconds: cooldown }) : t('auth.otpResend')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

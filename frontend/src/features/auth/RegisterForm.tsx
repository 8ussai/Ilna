import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { register } from '../../api/auth'
import { ApiError } from '../../api/client'
import { fetchCatalog } from '../../api/meta'
import type { Catalog, Named } from '../../api/meta'
import { isStrongPassword } from '../../lib/password'
import { Field } from '../../components/Field'
import { PasswordChecklist } from './PasswordChecklist'
import { Select } from '../../components/Select'
import { primaryButton, secondaryButton } from '../../components/styles'
import { VerifyEmailForm } from './VerifyEmailForm'

type Values = {
  country: string
  university: string
  college: string
  major: string
  first_name: string
  last_name: string
  username: string
  email: string
  password: string
}

const empty: Values = {
  country: '',
  university: '',
  college: '',
  major: '',
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  password: '',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// same rule as USERNAME_RE in backend/accounts/schemas.py
const USERNAME_RE = /^[a-z0-9_]{3,30}$/
// same as RESERVED_USERNAME_WORDS in backend/config.py: anonymous posts show as "Anonymous N" and "Author"
const RESERVED_USERNAME_WORDS = ['anonymous', 'author']

export function RegisterForm({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const nameOf = (n: Named) => (isAr ? n.name_ar : n.name_en)
  const toOptions = (items: Named[]) => items.map((n) => ({ value: n.id, label: nameOf(n) }))

  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // 2 is entering the emailed code
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [values, setValues] = useState<Values>(empty)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then((data) => !cancelled && (setCatalog(data), setLoadFailed(false)))
      .catch(() => !cancelled && setLoadFailed(true))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const country = catalog?.countries.find((c) => c.id === values.country)
  const university = country?.universities.find((u) => u.id === values.university)
  const college = university?.colleges.find((c) => c.id === values.college)

  // Each dropdown depends on the previous one; changing it clears everything after it.
  const chain: (keyof Values)[] = ['country', 'university', 'college', 'major']
  function setChoice(field: keyof Values, value: string) {
    setValues((v) => {
      const next = { ...v, [field]: value }
      chain.slice(chain.indexOf(field) + 1).forEach((f) => (next[f] = ''))
      return next
    })
  }

  function setText(field: keyof Values, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    setServerErrors((e) => ({ ...e, [field]: undefined }))
  }

  const errors = (() => {
    const e: Partial<Record<keyof Values, string>> = {}
    const required = t('errors.required')

    for (const f of chain) if (!values[f]) e[f] = required

    if (!values.first_name.trim()) e.first_name = required
    if (!values.last_name.trim()) e.last_name = required

    if (!values.username.trim()) e.username = required
    else if (!USERNAME_RE.test(values.username)) e.username = t('errors.usernameInvalid')
    else if (!/[a-z]/.test(values.username)) e.username = t('errors.usernameNoLetter')
    else {
      const reserved = RESERVED_USERNAME_WORDS.find((word) => values.username.includes(word))
      if (reserved) e.username = t('errors.usernameReserved', { word: reserved })
    }

    const emailDomain = values.email.trim().split('@')[1]?.toLowerCase() ?? ''
    if (!values.email.trim()) e.email = required
    else if (!EMAIL_RE.test(values.email.trim())) e.email = t('errors.emailInvalid')
    else if (university && emailDomain !== university.domain && !emailDomain.endsWith('.' + university.domain)) {
      e.email = t('errors.emailDomain', { university: nameOf(university), domain: university.domain })
    }

    if (!values.password) e.password = required
    else if (!isStrongPassword(values.password)) e.password = t('errors.passwordWeak')

    return e
  })()

  const show = (f: keyof Values) => (submitted ? (errors[f] ?? serverErrors[f]) : serverErrors[f])

  function goNext(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (chain.some((f) => errors[f])) return
    setSubmitted(false)
    setStep(1)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    try {
      await register({
        username: values.username.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim(),
        password: values.password,
        country: values.country,
        university: values.university,
        college: values.college,
        major: values.major,
      })
      setStep(2)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.detail === 'Email already used') {
        setServerErrors({ email: t('errors.emailTaken') })
      } else if (err instanceof ApiError && err.status === 400 && err.detail === 'Username already taken') {
        setServerErrors({ username: t('errors.usernameTaken') })
      } else if (err instanceof ApiError && err.status === 502) {
        setFormError(t('errors.otpSendFailed'))
      } else if (err instanceof ApiError && err.status === 0) {
        setFormError(t('errors.network'))
      } else {
        setFormError(t('errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (loadFailed) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-danger">
          {t('errors.listFailed')}
        </p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={secondaryButton}>
          {t('auth.retry')}
        </button>
      </div>
    )
  }

  if (!catalog) {
    return <p className="text-muted">{t('auth.loadingList')}</p>
  }

  if (step === 2) {
    return <VerifyEmailForm email={values.email.trim()} onAuthenticated={onAuthenticated} onBack={() => setStep(1)} />
  }

  const header = (
    <div>
      <p className="text-sm text-muted">{t('auth.stepOf', { current: step + 1, total: 2 })}</p>
      <h2 className="font-serif text-2xl font-semibold">{step === 0 ? t('auth.stepStudies') : t('auth.stepAccount')}</h2>
    </div>
  )

  if (step === 0) {
    return (
      <form onSubmit={goNext} noValidate className="space-y-4">
        {header}
        <Select
          label={t('auth.country')}
          value={values.country}
          options={toOptions(catalog.countries)}
          onChange={(v) => setChoice('country', v)}
          error={show('country')}
        />
        <Select
          label={t('auth.university')}
          value={values.university}
          options={toOptions(country?.universities ?? [])}
          onChange={(v) => setChoice('university', v)}
          disabled={!country}
          error={show('university')}
        />
        <Select
          label={t('auth.college')}
          value={values.college}
          options={toOptions(university?.colleges ?? [])}
          onChange={(v) => setChoice('college', v)}
          disabled={!university}
          error={show('college')}
        />
        <Select
          label={t('auth.major')}
          value={values.major}
          options={toOptions(college?.majors ?? [])}
          onChange={(v) => setChoice('major', v)}
          disabled={!college}
          error={show('major')}
        />
        <button type="submit" className={primaryButton}>
          {t('auth.next')}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {header}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('auth.firstName')}
          value={values.first_name}
          onChange={(e) => setText('first_name', e.target.value)}
          autoComplete="given-name"
          error={show('first_name')}
        />
        <Field
          label={t('auth.lastName')}
          value={values.last_name}
          onChange={(e) => setText('last_name', e.target.value)}
          autoComplete="family-name"
          error={show('last_name')}
        />
      </div>
      <Field
        label={t('auth.username')}
        value={values.username}
        onChange={(e) => setText('username', e.target.value.toLowerCase())}
        autoComplete="username"
        hint={t('auth.usernameHint')}
        error={show('username')}
      />
      <Field
        label={t('auth.email')}
        type="email"
        dir="ltr"
        value={values.email}
        onChange={(e) => setText('email', e.target.value)}
        autoComplete="email"
        hint={university ? t('auth.emailHint', { domain: university.domain }) : t('auth.emailHintGeneric')}
        error={show('email')}
      />
      <Field
        label={t('auth.password')}
        type="password"
        value={values.password}
        onChange={(e) => setText('password', e.target.value)}
        autoComplete="new-password"
        error={show('password')}
      />
      <PasswordChecklist password={values.password} />

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={() => (setSubmitted(false), setStep(0))} className={`${secondaryButton} w-1/3`}>
          {t('auth.back')}
        </button>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? t('auth.working') : t('auth.submitSignup')}
        </button>
      </div>
    </form>
  )
}

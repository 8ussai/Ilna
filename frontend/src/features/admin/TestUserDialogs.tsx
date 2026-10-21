import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { createTestUser, fetchTestPassword, newTestPassword } from '../../api/admin'
import type { AdminUser, TestUserInput } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { Catalog, Named } from '../../api/meta'
import { Dialog } from '../../components/Dialog'
import { Field } from '../../components/Field'
import { Select } from '../../components/Select'
import { dangerButtonInline, primaryButtonInline, secondaryButtonInline } from '../../components/styles'

const EMPTY: TestUserInput = { first_name: '', last_name: '', country: '', university: '', college: '', major: '' }
// each choice depends on the one before; changing it clears the rest
const CHAIN = ['country', 'university', 'college', 'major'] as const

// Names and studies, as at sign-up but without an email; the username and password are made by the server.
export function NewTestUserDialog({
  catalog,
  onClose,
  onCreated,
}: {
  catalog: Catalog | null
  onClose: () => void
  onCreated: (user: AdminUser, password: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [values, setValues] = useState<TestUserInput>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const nameOf = (item: Named) => (i18n.language === 'ar' ? item.name_ar : item.name_en)
  const toOptions = (items: Named[]) => items.map((item) => ({ value: item.id, label: nameOf(item) }))
  const country = catalog?.countries.find((c) => c.id === values.country)
  const university = country?.universities.find((u) => u.id === values.university)
  const college = university?.colleges.find((c) => c.id === values.college)

  function setChoice(field: (typeof CHAIN)[number], value: string) {
    setValues((v) => {
      const next = { ...v, [field]: value }
      CHAIN.slice(CHAIN.indexOf(field) + 1).forEach((f) => (next[f] = ''))
      return next
    })
  }

  const required = t('errors.required')
  const missing = (field: keyof TestUserInput) => (submitted && !values[field].trim() ? required : undefined)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    if (Object.values(values).some((v) => !v.trim())) return

    setBusy(true)
    try {
      const { user, password } = await createTestUser({ ...values, first_name: values.first_name.trim(), last_name: values.last_name.trim() })
      onCreated(user, password)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('admin.testUsers.newTitle')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-muted">{t('admin.testUsers.newExplain')}</p>
        <Field
          label={t('auth.firstName')}
          value={values.first_name}
          maxLength={50}
          dir="auto"
          onChange={(e) => setValues((v) => ({ ...v, first_name: e.target.value }))}
          error={missing('first_name')}
        />
        <Field
          label={t('auth.lastName')}
          value={values.last_name}
          maxLength={50}
          dir="auto"
          onChange={(e) => setValues((v) => ({ ...v, last_name: e.target.value }))}
          error={missing('last_name')}
        />
        {catalog ? (
          <>
            <Select
              label={t('auth.country')}
              value={values.country}
              options={toOptions(catalog.countries)}
              onChange={(v) => setChoice('country', v)}
              error={missing('country')}
            />
            <Select
              label={t('auth.university')}
              value={values.university}
              options={toOptions(country?.universities ?? [])}
              onChange={(v) => setChoice('university', v)}
              disabled={!country}
              error={missing('university')}
            />
            <Select
              label={t('auth.college')}
              value={values.college}
              options={toOptions(university?.colleges ?? [])}
              onChange={(v) => setChoice('college', v)}
              disabled={!university}
              error={missing('college')}
            />
            <Select
              label={t('auth.major')}
              value={values.major}
              options={toOptions(college?.majors ?? [])}
              onChange={(v) => setChoice('major', v)}
              disabled={!college}
              error={missing('major')}
            />
          </>
        ) : (
          <p className="text-sm text-muted">{t('auth.loadingList')}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonInline}>
            {t('admin.cancel')}
          </button>
          <button type="submit" disabled={busy || !catalog} className={primaryButtonInline}>
            {busy ? t('auth.working') : t('admin.testUsers.create')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// The username and password to hand out. Opens with a just-made password, or fetches the current one.
export function TestPasswordDialog({
  user,
  initialPassword,
  onClose,
}: {
  user: AdminUser
  initialPassword?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [password, setPassword] = useState<string | null>(initialPassword ?? null)
  const [error, setError] = useState('')
  // the stored password can't be read back (SECRET_KEY changed); a new one fixes it
  const [unreadable, setUnreadable] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (initialPassword) return
    let cancelled = false
    fetchTestPassword(user.id)
      .then(({ password }) => !cancelled && setPassword(password))
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 409) setUnreadable(true)
        else setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
      })
    return () => {
      cancelled = true
    }
  }, [user.id, initialPassword, t])

  async function makeNew() {
    setBusy(true)
    setError('')
    try {
      const { password } = await newTestPassword(user.id)
      setPassword(password)
      setUnreadable(false)
      setConfirmNew(false)
      setCopied('')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
    } catch {
      // clipboard blocked; the text is on screen to copy by hand
    }
  }

  const row = (label: string, value: string | null, key: string) => (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <span className="w-24 shrink-0 text-sm text-muted">{label}</span>
      <code dir="ltr" className="min-w-0 flex-1 break-all text-start font-mono text-base">
        {value ?? '…'}
      </code>
      {value && (
        <button type="button" onClick={() => copy(key, value)} className="shrink-0 text-sm font-medium text-accent hover:underline">
          {copied === key ? t('admin.testUsers.copied') : t('admin.testUsers.copy')}
        </button>
      )}
    </div>
  )

  return (
    <Dialog title={t('admin.testUsers.passwordTitle', { username: user.username })} onClose={onClose}>
      <div className="space-y-4">
        {initialPassword && <p className="text-sm">{t('admin.testUsers.created')}</p>}
        {row(t('auth.username'), user.username, 'username')}
        {unreadable ? (
          <p className="text-sm text-danger">{t('admin.testUsers.unreadable')}</p>
        ) : (
          row(t('auth.password'), password, 'password')
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {confirmNew ? (
          <div className="space-y-3 rounded-lg border border-danger/40 p-3">
            <p className="text-sm">{t('admin.testUsers.newPasswordExplain')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirmNew(false)} className={secondaryButtonInline}>
                {t('admin.cancel')}
              </button>
              <button type="button" onClick={makeNew} disabled={busy} className={dangerButtonInline}>
                {busy ? t('auth.working') : t('admin.testUsers.newPasswordConfirm')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setConfirmNew(true)} className={secondaryButtonInline}>
              {t('admin.testUsers.newPassword')}
            </button>
            <button type="button" onClick={onClose} className={primaryButtonInline}>
              {t('admin.testUsers.done')}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

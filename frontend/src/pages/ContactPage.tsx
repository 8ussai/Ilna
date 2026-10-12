import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { sendContactMessage } from '../api/me'
import { Field, FieldMessage } from '../components/Field'
import { primaryButton, secondaryButton } from '../components/styles'

const SUBJECT_MAX = 150
const MESSAGE_MAX = 5000

// Sends a message to the Ilna team by email; replies go to the user's own email address.
export function ContactPage({ email }: { email: string }) {
  const { t } = useTranslation()
  const messageId = useId()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')

  const required = t('errors.required')
  const subjectError = submitted && !subject.trim() ? required : undefined
  const messageError = submitted && !message.trim() ? required : undefined

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setFormError('')
    if (!subject.trim() || !message.trim()) return

    setBusy(true)
    try {
      await sendContactMessage(subject.trim(), message.trim())
      setSent(true)
    } catch (err) {
      const code = err instanceof ApiError ? err.status : -1
      if (code === 429) setFormError(t('settings.contact.tooMany'))
      else if (code === 503) setFormError(t('settings.contact.unavailable'))
      else if (code === 0) setFormError(t('errors.network'))
      else setFormError(t('settings.contact.failed'))
    } finally {
      setBusy(false)
    }
  }

  function writeAnother() {
    setSubject('')
    setMessage('')
    setSubmitted(false)
    setSent(false)
  }

  return (
    <>
      <h1 className="mt-3 font-serif text-3xl font-semibold">{t('settings.contact.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.contact.description', { email })}</p>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        {sent ? (
          <div role="status" className="text-center">
            <p className="text-lg font-semibold">{t('settings.contact.sentTitle')}</p>
            <p className="mt-1 text-muted">{t('settings.contact.sentBody', { email })}</p>
            <button type="button" onClick={writeAnother} className={`${secondaryButton} mt-4 w-auto`}>
              {t('settings.contact.another')}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field
              label={t('settings.contact.subject')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={SUBJECT_MAX}
              error={subjectError}
            />

            <div>
              <label htmlFor={messageId} className="mb-1.5 block text-sm font-medium">
                {t('settings.contact.message')}
              </label>
              <textarea
                id={messageId}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX}
                rows={7}
                dir="auto"
                aria-invalid={messageError ? true : undefined}
                aria-describedby={messageError ? `${messageId}-err` : `${messageId}-hint`}
                className={`block w-full resize-y rounded-lg border bg-card px-3 py-2.5 text-fg placeholder:text-muted ${
                  messageError ? 'border-danger' : 'border-line'
                }`}
              />
              <FieldMessage
                id={messageId}
                error={messageError}
                hint={t('settings.contact.counter', { count: message.length, max: MESSAGE_MAX })}
              />
            </div>

            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}

            <button type="submit" disabled={busy} className={`${primaryButton} sm:w-auto`}>
              {busy ? t('settings.contact.sending') : t('settings.contact.send')}
            </button>
          </form>
        )}
      </section>
    </>
  )
}

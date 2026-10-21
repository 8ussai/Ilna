import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { createAdminPost, MAX_PIN_HOURS } from '../../api/admin'
import type { AdminPost } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { Catalog, Named } from '../../api/meta'
import type { PostScope } from '../../api/posts'
import { Select } from '../../components/Select'
import { primaryButtonInline, secondaryButtonInline } from '../../components/styles'

// matches AdminPostCreate in backend/admin/schemas.py
const MAX_CONTENT = 5000
const SCOPES: PostScope[] = ['general', 'university', 'college', 'major']
const DEFAULT_PIN_HOURS = 24

// A post from Ilna Admin in any blog, optionally pinned to the top for some hours.
export function AdminPostComposer({
  catalog,
  onPosted,
  onCancel,
}: {
  catalog: Catalog | null
  onPosted: (post: AdminPost) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  // a catalog entry's name in the panel's language
  const nameOf = (n: Named) => (i18n.language === 'ar' ? n.name_ar : n.name_en)
  // catalog entries as select options
  const toOptions = (items: Named[]) => items.map((n) => ({ value: n.id, label: nameOf(n) }))

  const [scope, setScope] = useState<PostScope>('general')
  const [university, setUniversity] = useState('')
  const [college, setCollege] = useState('')
  const [major, setMajor] = useState('')
  const [content, setContent] = useState('')
  const [pin, setPin] = useState(true)
  const [pinHours, setPinHours] = useState(String(DEFAULT_PIN_HOURS))
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const universities = catalog?.countries.flatMap((c) => c.universities) ?? []
  const uni = universities.find((u) => u.id === university)
  const col = uni?.colleges.find((c) => c.id === college)
  const value = scope === 'general' ? null : { university, college, major }[scope] || null

  const hours = Number(pinHours)
  const errors = {
    place: scope !== 'general' && !value ? t('errors.required') : undefined,
    content: !content.trim() ? t('errors.required') : undefined,
    pin: pin && !(Number.isInteger(hours) && hours >= 1 && hours <= MAX_PIN_HOURS) ? t('admin.adminPosts.pinRange', { max: MAX_PIN_HOURS }) : undefined,
  }

  // posts as Ilna Admin
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    if (errors.place || errors.content || errors.pin) return
    setBusy(true)
    try {
      onPosted(await createAdminPost(scope, value, content.trim(), pin ? hours : null))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border border-accent/40 bg-card p-4">
      <h3 className="font-serif text-xl font-semibold">{t('admin.adminPosts.new')}</h3>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('admin.posts.blog')}</legend>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                scope === s ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name="admin-post-scope"
                checked={scope === s}
                onChange={() => setScope(s)}
                className="size-4 accent-[var(--accent)]"
              />
              {t(`tabs.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {scope !== 'general' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label={t('admin.messages.university')}
            value={university}
            options={toOptions(universities)}
            onChange={(v) => (setUniversity(v), setCollege(''), setMajor(''))}
            error={submitted && scope === 'university' ? errors.place : undefined}
          />
          {scope !== 'university' && (
            <Select
              label={t('admin.messages.college')}
              value={college}
              options={toOptions(uni?.colleges ?? [])}
              onChange={(v) => (setCollege(v), setMajor(''))}
              disabled={!uni}
              error={submitted && scope === 'college' ? errors.place : undefined}
            />
          )}
          {scope === 'major' && (
            <Select
              label={t('admin.messages.major')}
              value={major}
              options={toOptions(col?.majors ?? [])}
              onChange={setMajor}
              disabled={!col}
              error={submitted ? errors.place : undefined}
            />
          )}
        </div>
      )}

      <div>
        <label htmlFor="admin-post-content" className="mb-1.5 block text-sm font-medium">
          {t('admin.adminPosts.content')}
        </label>
        <textarea
          id="admin-post-content"
          dir="auto"
          rows={5}
          maxLength={MAX_CONTENT}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={submitted && errors.content ? true : undefined}
          className={`block w-full resize-y rounded-lg border bg-card px-3 py-2 text-fg ${
            submitted && errors.content ? 'border-danger' : 'border-line'
          }`}
        />
        {submitted && errors.content && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {errors.content}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {t('admin.adminPosts.pinFor')}
        </label>
        {pin && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PIN_HOURS}
              value={pinHours}
              onChange={(e) => setPinHours(e.target.value)}
              aria-label={t('admin.adminPosts.hours')}
              className="h-9 w-20 rounded-lg border border-line bg-card px-2 text-fg"
            />
            {t('admin.adminPosts.hours')}
          </label>
        )}
      </div>
      {submitted && errors.pin && (
        <p role="alert" className="text-sm text-danger">
          {errors.pin}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButtonInline}>
          {t('admin.cancel')}
        </button>
        <button type="submit" disabled={busy} className={primaryButtonInline}>
          {busy ? t('auth.working') : t('admin.adminPosts.publish')}
        </button>
      </div>
    </form>
  )
}

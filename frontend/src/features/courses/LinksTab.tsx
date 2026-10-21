import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { deleteCourseLink, updateCourseLink } from '../../api/courses'
import type { CourseLink } from '../../api/courses'
import { DeleteButton } from '../../components/DeleteButton'
import { Field } from '../../components/Field'
import { smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { isWebUrl, LINK_TITLE_MAX } from './courseLinks'
import { LinkForm } from './LinkForm'
import { useCourseCanEdit } from './courseAccess'

type LinksTabProps = {
  courseId: number
  links: CourseLink[]
  onAdded: (link: CourseLink) => void
  onChanged: (link: CourseLink) => void
  onDeleted: (linkId: number) => void
}

export function LinksTab({ courseId, links, onAdded, onChanged, onDeleted }: LinksTabProps) {
  const { t } = useTranslation()
  const canEdit = useCourseCanEdit()

  return (
    <div className="space-y-4">
      {links.length === 0 ? (
        <p className="py-8 text-center text-muted">{t('courses.links.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {links.map((link) => (
            <LinkRow key={link.id} courseId={courseId} link={link} onChanged={onChanged} onDeleted={() => onDeleted(link.id)} />
          ))}
        </ul>
      )}

      {canEdit && (
        <section aria-labelledby="add-link-title" className="rounded-2xl border border-line bg-card p-4">
          <h3 id="add-link-title" className="mb-3 font-semibold">
            {t('courses.links.addTitle')}
          </h3>
          <LinkForm courseId={courseId} onAdded={onAdded} />
        </section>
      )}
    </div>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function LinkRow({
  courseId,
  link,
  onChanged,
  onDeleted,
}: {
  courseId: number
  link: CourseLink
  onChanged: (link: CourseLink) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const canEdit = useCourseCanEdit()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setError('')
    try {
      await deleteCourseLink(courseId, link.id)
    } catch (err) {
      // already gone counts as deleted
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(t('errors.generic'))
        return
      }
    }
    onDeleted()
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <LinkEditForm courseId={courseId} link={link} onSaved={onChanged} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Favicon url={link.url} />
      <div className="min-w-0 flex-1 basis-48">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          dir="auto"
          className="block truncate font-medium hover:underline"
        >
          {link.title}
          <span className="sr-only"> ({t('courses.links.newTab')})</span>
        </a>
        <p dir="ltr" className="truncate text-start text-sm text-muted">
          {hostOf(link.url)}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {canEdit && (
        <div className="-me-2 flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setEditing(true)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
            {t('courses.links.edit')}
          </button>
          <DeleteButton question={t('courses.links.confirmDelete')} onConfirm={remove} />
        </div>
      )}
    </li>
  )
}

// the site's own icon, fetched without a referrer; a globe when it has none
function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)
  let src: string | null = null
  try {
    src = `${new URL(url).origin}/favicon.ico`
  } catch {
    // an unparseable URL can't have been saved, but don't crash on one
  }

  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-muted">
      {src && !failed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="size-5" />
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      )}
    </span>
  )
}

function LinkEditForm({
  courseId,
  link,
  onSaved,
  onDone,
}: {
  courseId: number
  link: CourseLink
  onSaved: (link: CourseLink) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(link.title)
  const [url, setUrl] = useState(link.url)
  const [errors, setErrors] = useState<{ title?: string; url?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('errors.required')
    if (!isWebUrl(url)) next.url = t('courses.links.urlInvalid')
    setErrors(next)
    if (next.title || next.url) return

    setBusy(true)
    try {
      onSaved(await updateCourseLink(courseId, link.id, { title: title.trim(), url: url.trim() }))
      onDone()
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic') })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate onKeyDown={(e) => e.key === 'Escape' && onDone()} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('courses.links.title')}
          value={title}
          maxLength={LINK_TITLE_MAX}
          dir="auto"
          autoFocus
          error={errors.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Field
          label={t('courses.links.url')}
          type="url"
          inputMode="url"
          dir="ltr"
          value={url}
          error={errors.url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={smallPrimaryButton}>
          {busy ? t('auth.working') : t('courses.form.save')}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={smallSecondaryButton}>
          {t('feed.cancel')}
        </button>
      </div>
    </form>
  )
}

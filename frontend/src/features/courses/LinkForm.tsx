import { useImperativeHandle, useState } from 'react'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { addCourseLink } from '../../api/courses'
import type { CourseLink } from '../../api/courses'
import { Field } from '../../components/Field'
import { secondaryButtonInline } from '../../components/styles'
import { isWebUrl, LINK_TITLE_MAX } from './courseLinks'
import type { LinkFormHandle } from './courseLinks'

// Saves one link at a time. `flush` saves whatever is typed in it (the new-course dialog's "Done" uses it).
export function LinkForm({
  courseId,
  ref,
  onAdded,
}: {
  courseId: number
  ref?: Ref<LinkFormHandle>
  onAdded: (link: CourseLink) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [errors, setErrors] = useState<{ title?: string; url?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  // true when the form is empty or was saved, false when the user needs to fix something
  async function save(): Promise<boolean> {
    if (!title.trim() && !url.trim()) return true
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('errors.required')
    if (!isWebUrl(url)) next.url = t('courses.links.urlInvalid')
    setErrors(next)
    if (next.title || next.url) return false

    setBusy(true)
    try {
      onAdded(await addCourseLink(courseId, title.trim(), url.trim()))
      setTitle('')
      setUrl('')
      return true
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic') })
      return false
    } finally {
      setBusy(false)
    }
  }

  useImperativeHandle(ref, () => ({ flush: save }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('courses.links.title')}
          value={title}
          maxLength={LINK_TITLE_MAX}
          dir="auto"
          error={errors.title}
          onChange={(e) => {
            setTitle(e.target.value)
            setErrors((current) => ({ ...current, title: undefined }))
          }}
        />
        <Field
          label={t('courses.links.url')}
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          value={url}
          error={errors.url}
          onChange={(e) => {
            setUrl(e.target.value)
            setErrors((current) => ({ ...current, url: undefined }))
          }}
        />
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={busy} className={secondaryButtonInline}>
        {busy ? t('auth.working') : t('courses.links.add')}
      </button>
    </form>
  )
}

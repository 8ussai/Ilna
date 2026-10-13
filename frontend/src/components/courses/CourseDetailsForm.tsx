import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { COURSE_DESCRIPTION_MAX, COURSE_TITLE_MAX } from '../../api/courses'
import type { CourseColor, CourseInput } from '../../api/courses'
import { controlClass, Field, FieldMessage } from '../Field'
import { primaryButtonInline, secondaryButtonInline } from '../styles'
import { CourseLookPicker } from './CourseLookPicker'
import { isSingleEmoji } from './courseColors'

type CourseDetailsFormProps = {
  initial?: CourseInput
  submitLabel: string
  onSubmit: (input: CourseInput) => Promise<void>
  onCancel: () => void
}

// Name, description, color and emoji: creating a course and the course page's Edit both use it.
export function CourseDetailsForm({ initial, submitLabel, onSubmit, onCancel }: CourseDetailsFormProps) {
  const { t } = useTranslation()
  const descriptionId = useId()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState<CourseColor | null>(initial?.color ?? null)
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [errors, setErrors] = useState<{ title?: string; emoji?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('errors.required')
    if (emoji.trim() && !isSingleEmoji(emoji.trim())) next.emoji = t('courses.form.emojiInvalid')
    setErrors(next)
    if (next.title || next.emoji) return

    setBusy(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        color,
        emoji: emoji.trim() || null,
      })
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic') })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        label={t('courses.form.name')}
        value={title}
        maxLength={COURSE_TITLE_MAX}
        dir="auto"
        placeholder={t('courses.form.namePlaceholder')}
        error={errors.title}
        onChange={(e) => {
          setTitle(e.target.value)
          setErrors((current) => ({ ...current, title: undefined }))
        }}
      />

      <div>
        <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-medium">
          {t('courses.form.description')} <span className="font-normal text-muted">{t('courses.form.optional')}</span>
        </label>
        <textarea
          id={descriptionId}
          value={description}
          maxLength={COURSE_DESCRIPTION_MAX}
          dir="auto"
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${descriptionId}-hint`}
          className={`${controlClass} h-auto resize-y py-2.5`}
        />
        <FieldMessage
          id={descriptionId}
          hint={t('settings.contact.counter', { count: description.length, max: COURSE_DESCRIPTION_MAX })}
        />
      </div>

      <CourseLookPicker
        color={color}
        emoji={emoji}
        emojiError={errors.emoji}
        onColorChange={setColor}
        onEmojiChange={(value) => {
          setEmoji(value)
          setErrors((current) => ({ ...current, emoji: undefined }))
        }}
      />

      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className={secondaryButtonInline}>
          {t('feed.cancel')}
        </button>
        <button type="submit" disabled={busy} className={primaryButtonInline}>
          {busy ? t('auth.working') : submitLabel}
        </button>
      </div>
    </form>
  )
}

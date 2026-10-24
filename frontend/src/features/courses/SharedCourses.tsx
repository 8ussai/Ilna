import { useEffect, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { addSharedCourse, fetchPublicCoursesOf, fetchSharedWithMe, findCourseByCode, ignoreSharedCourse } from '../../api/courseSharing'
import type { CoursePreview } from '../../api/courseSharing'
import { Dialog } from '../../components/Dialog'
import { UserName } from '../account/Premium'
import { primaryButtonInline, smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { courseColorClass } from './courseColors'

// what the server says when adding would go over the course limit
function addError(err: unknown, t: (key: string) => string) {
  if (err instanceof ApiError && err.status === 403) return t('courses.shared.limit')
  if (err instanceof ApiError && err.status === 404) return t('courses.shared.gone')
  return t('errors.generic')
}

// a course someone else owns, before it's added
// showOwner is off on a profile card, where the owner is the person shown
function PreviewCard({ course, children, showOwner = true }: { course: CoursePreview; children?: ReactNode; showOwner?: boolean }) {
  const { t } = useTranslation()
  const counts = [
    t('courses.counts.files', { count: course.documents_count }),
    t('courses.counts.recordings', { count: course.audio_count }),
    t('courses.counts.links', { count: course.links_count }),
  ].filter((_, i) => [course.documents_count, course.audio_count, course.links_count][i] > 0)

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <div aria-hidden="true" className={`h-1.5 ${courseColorClass(course.color)}`} />
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1 basis-56">
          <h3 dir="auto" className="break-words font-semibold">
            {course.title}
          </h3>
          {showOwner && (
            <p className="mt-0.5 text-sm text-muted">
              {t('courses.shared.by')} <UserName user={course.owner} /> <span dir="ltr">@{course.owner.username}</span>
            </p>
          )}
          {course.description && (
            <p dir="auto" className="mt-1 line-clamp-2 text-sm text-muted">
              {course.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">{counts.length > 0 ? counts.join(' · ') : t('courses.counts.empty')}</p>
        </div>
        {children}
      </div>
    </article>
  )
}

// "Shared with you" at the top of My Courses: Add or Ignore each one. Hidden when there's nothing.
export function SharedWithYou({ reloadKey, onAdded }: { reloadKey: number; onAdded: () => void }) {
  const { t } = useTranslation()
  const [courses, setCourses] = useState<CoursePreview[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    let ignore = false
    fetchSharedWithMe()
      .then((list) => !ignore && setCourses(list))
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [reloadKey])

  // adds or ignores a shared course
  async function answer(course: CoursePreview, add: boolean) {
    setBusyId(course.id)
    setError(null)
    try {
      if (add) await addSharedCourse(course.id)
      else await ignoreSharedCourse(course.id)
      setCourses((current) => current.filter((c) => c.id !== course.id))
      if (add) onAdded()
    } catch (err) {
      setError({ id: course.id, message: addError(err, t) })
    } finally {
      setBusyId(null)
    }
  }

  if (courses.length === 0) return null

  return (
    <section aria-labelledby="shared-with-you" className="space-y-3">
      <h2 id="shared-with-you" className="font-serif text-xl font-semibold">
        {t('courses.shared.withYou')}
      </h2>
      <ul className="space-y-3">
        {courses.map((course) => (
          <li key={course.id}>
            <PreviewCard course={course}>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex gap-2">
                  <button type="button" disabled={busyId === course.id} onClick={() => answer(course, false)} className={smallSecondaryButton}>
                    {t('courses.shared.ignore')}
                  </button>
                  <button type="button" disabled={busyId === course.id} onClick={() => answer(course, true)} className={smallPrimaryButton}>
                    {t('courses.shared.add')}
                  </button>
                </div>
                {error?.id === course.id && (
                  <span role="alert" className="text-xs text-danger">
                    {error.message}
                  </span>
                )}
              </div>
            </PreviewCard>
          </li>
        ))}
      </ul>
    </section>
  )
}

// My Courses > "Add by ID": type the code someone gave you, check what it is, then add it.
export function AddByIdDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (courseId: number) => void }) {
  const { t } = useTranslation()
  const inputId = useId()
  const [code, setCode] = useState('')
  const [found, setFound] = useState<CoursePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // finds the course for the typed ID
  async function find(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError('')
    setFound(null)
    try {
      setFound(await findCourseByCode(code))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? t('courses.shared.notFound') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  // adds the found course
  async function add(course: CoursePreview) {
    setBusy(true)
    setError('')
    try {
      await addSharedCourse(course.id)
      onAdded(course.id)
    } catch (err) {
      setError(addError(err, t))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('courses.shared.addById')} onClose={onClose}>
      <form onSubmit={find} className="space-y-3">
        <label htmlFor={inputId} className="block text-sm text-muted">
          {t('courses.shared.addByIdHint')}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7Q2-M9XD"
            dir="ltr"
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 font-mono tracking-wider placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button type="submit" disabled={busy || !code.trim()} className={primaryButtonInline}>
            {t('courses.shared.find')}
          </button>
        </div>
      </form>

      {found && (
        <div className="mt-4">
          <PreviewCard course={found}>
            {found.is_owner ? (
              <span className="text-sm text-muted">{t('courses.shared.yours')}</span>
            ) : found.is_member ? (
              <span className="text-sm text-muted">{t('courses.shared.alreadyAdded')}</span>
            ) : (
              <button type="button" disabled={busy} onClick={() => add(found)} className={smallPrimaryButton}>
                {t('courses.shared.add')}
              </button>
            )}
          </PreviewCard>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}

// The "Public courses" part of a profile card: each one can be added from here, like with its course ID.
export function ProfileCourses({ username }: { username: string }) {
  const { t } = useTranslation()
  const [courses, setCourses] = useState<CoursePreview[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    let ignore = false
    fetchPublicCoursesOf(username)
      .then((list) => !ignore && setCourses(list))
      .catch(() => !ignore && setFailed(true))
    return () => {
      ignore = true
    }
  }, [username])

  // adds one of the courses to the viewer's courses
  async function add(course: CoursePreview) {
    setBusyId(course.id)
    setError(null)
    try {
      const added = await addSharedCourse(course.id)
      setCourses((current) => current?.map((c) => (c.id === added.id ? added : c)) ?? null)
    } catch (err) {
      setError({ id: course.id, message: addError(err, t) })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-labelledby="profile-courses" className="space-y-2 border-t border-line pt-4">
      <h3 id="profile-courses" className="text-sm font-medium">
        {t('courses.shared.profileTitle')}
      </h3>
      {failed ? (
        <p className="text-sm text-muted">{t('courses.shared.profileFailed')}</p>
      ) : courses === null ? (
        <p className="text-sm text-muted" role="status">
          {t('feed.loading')}
        </p>
      ) : courses.length === 0 ? (
        <p className="text-sm text-muted">{t('courses.shared.profileEmpty')}</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {courses.map((course) => (
            <li key={course.id}>
              <PreviewCard course={course} showOwner={false}>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {course.is_owner ? (
                    <span className="text-sm text-muted">{t('courses.shared.yoursShort')}</span>
                  ) : course.is_member ? (
                    <span className="text-sm text-muted">{t('courses.shared.added')}</span>
                  ) : (
                    <button type="button" disabled={busyId === course.id} onClick={() => add(course)} className={smallPrimaryButton}>
                      {t('courses.shared.add')}
                    </button>
                  )}
                  {error?.id === course.id && (
                    <span role="alert" className="max-w-48 text-end text-xs text-danger">
                      {error.message}
                    </span>
                  )}
                </div>
              </PreviewCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

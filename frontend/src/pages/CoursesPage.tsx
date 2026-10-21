import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { leaveCourse } from '../api/courseSharing'
import { deleteCourse, fetchCourses, updateCourse } from '../api/courses'
import type { Course, CourseSummary } from '../api/courses'
import { fetchUsage } from '../api/me'
import { CourseCard } from '../components/courses/CourseCard'
import { NewCourseDialog } from '../components/courses/NewCourseDialog'
import { AddByIdDialog, SharedWithYou } from '../components/courses/SharedCourses'
import { secondaryButtonInline, smallSecondaryButton } from '../components/styles'

type Status = 'loading' | 'ready' | 'error'

export function CoursesPage({ onOpenCourse }: { onOpenCourse: (courseId: number) => void }) {
  const { t } = useTranslation()
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [addingById, setAddingById] = useState(false)
  // null for premium (no limit), and while unknown; the server enforces it either way
  const [courseLimit, setCourseLimit] = useState<number | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let ignore = false
    fetchCourses()
      .then((list) => {
        if (ignore) return
        setCourses(list)
        setStatus('ready')
      })
      .catch(() => {
        if (!ignore) setStatus('error')
      })
    return () => {
      ignore = true
    }
  }, [reloadKey])

  useEffect(() => {
    let ignore = false
    fetchUsage()
      .then((usage) => {
        if (!ignore) setCourseLimit(usage.course_limit)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  const atLimit = courseLimit !== null && courses.length >= courseLimit

  function reload() {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }

  function patchCourse(id: number, changes: Partial<CourseSummary>) {
    setCourses((current) => current.map((c) => (c.id === id ? { ...c, ...changes } : c)))
  }

  async function remove(id: number) {
    try {
      await deleteCourse(id)
    } catch (err) {
      // already gone counts as deleted
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setCourses((current) => current.filter((c) => c.id !== id))
    // the card that held focus is gone
    headingRef.current?.focus()
  }

  // an added course: off the list (the owner's course is untouched)
  async function leave(id: number) {
    await leaveCourse(id)
    setCourses((current) => current.filter((c) => c.id !== id))
    headingRef.current?.focus()
  }

  // closed after creating: reload so the new course shows with the counts of what was added
  function closeDialog(created: Course | null) {
    setCreating(false)
    if (created) setReloadKey((k) => k + 1)
  }

  // takes the new-course tile's place once the limit is reached
  const limitTile = (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center text-sm text-muted">
      <span className="font-medium text-fg">{t('courses.limit.reachedTitle', { limit: courseLimit })}</span>
      <span className="max-w-xs">{t('courses.limit.reachedBody')}</span>
    </div>
  )

  const newTile = (large: boolean) => (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center text-muted hover:border-accent hover:text-fg ${
        large ? 'min-h-56' : 'min-h-44'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="font-medium text-fg">{large ? t('courses.emptyTitle') : t('courses.new.tile')}</span>
      {large && <span className="max-w-sm text-sm">{t('courses.emptyBody')}</span>}
    </button>
  )

  return (
    <section aria-labelledby="courses-title" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 id="courses-title" ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold focus:outline-none">
          {t('tabs.my-courses')}
        </h1>
        <div className="flex items-center gap-3">
          {status === 'ready' && courseLimit !== null && (
            <p className="text-sm text-muted">{t('courses.limit.count', { count: courses.length, limit: courseLimit })}</p>
          )}
          <button type="button" onClick={() => setAddingById(true)} className={smallSecondaryButton}>
            {t('courses.shared.addById')}
          </button>
        </div>
      </div>

      <SharedWithYou reloadKey={reloadKey} onAdded={() => setReloadKey((k) => k + 1)} />

      {status === 'loading' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={t('feed.loading')}>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="h-44 animate-pulse overflow-hidden rounded-2xl border border-line bg-card">
              <div className="h-2 bg-surface" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-2/3 rounded bg-surface" />
                <div className="h-3 w-full rounded bg-surface" />
                <div className="h-3 w-1/2 rounded bg-surface" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="py-10 text-center">
          <p className="text-muted">{t('courses.loadFailed')}</p>
          <button type="button" onClick={reload} className={`${secondaryButtonInline} mt-4`}>
            {t('auth.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && courses.length === 0 && newTile(true)}

      {status === 'ready' && courses.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className="grid">{atLimit ? limitTile : newTile(false)}</li>
          {courses.map((course) => (
            <li key={course.id} className="grid">
              <CourseCard
                course={course}
                onOpen={() => onOpenCourse(course.id)}
                onUpdate={async (changes) => patchCourse(course.id, await updateCourse(course.id, changes))}
                onDelete={() => remove(course.id)}
                onLeave={() => leave(course.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {creating && <NewCourseDialog onClose={closeDialog} onDone={(course) => onOpenCourse(course.id)} />}
      {addingById && (
        <AddByIdDialog
          onClose={() => setAddingById(false)}
          onAdded={(courseId) => {
            setAddingById(false)
            onOpenCourse(courseId)
          }}
        />
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { fetchCourse } from '../api/courses'
import type { CourseDetail } from '../api/courses'
import { courseColorClass } from '../components/courses/courseColors'
import { secondaryButton } from '../components/styles'
import { inAppClick } from '../links'
import { tabPath } from '../tabs'

type Status = 'loading' | 'ready' | 'error' | 'unavailable'

// One course. For now its header and what it holds; the workspace tabs come next.
export function CoursePage({ courseId, onBack }: { courseId: number; onBack: () => void }) {
  const { t } = useTranslation()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    fetchCourse(courseId)
      .then((detail) => {
        if (ignore) return
        setCourse(detail)
        setStatus('ready')
      })
      .catch((err) => {
        if (ignore) return
        // someone else's course and a deleted one look the same
        setStatus(err instanceof ApiError && (err.status === 403 || err.status === 404) ? 'unavailable' : 'error')
      })
    return () => {
      ignore = true
    }
  }, [courseId, reloadKey])

  const back = (
    <a href={tabPath('my-courses')} onClick={inAppClick(onBack)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {t('courses.back')}
    </a>
  )

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        {back}
        <p className="py-10 text-center text-muted" role="status">
          {t('feed.loading')}
        </p>
      </div>
    )
  }

  if (status !== 'ready' || !course) {
    return (
      <div className="space-y-4">
        {back}
        <div className="py-10 text-center">
          <p className="text-muted">{status === 'unavailable' ? t('courses.unavailable') : t('courses.loadOneFailed')}</p>
          {status === 'error' && (
            <button
              type="button"
              onClick={() => {
                setStatus('loading')
                setReloadKey((k) => k + 1)
              }}
              className={`${secondaryButton} mt-4 w-auto`}
            >
              {t('auth.retry')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const documents = course.materials.filter((m) => m.kind === 'document').length
  const audio = course.materials.length - documents

  return (
    <div className="space-y-4">
      {back}
      <header className="overflow-hidden rounded-2xl border border-line bg-card">
        <div aria-hidden="true" className={`h-2 ${courseColorClass(course.color)}`} />
        <div className="flex items-start gap-4 p-5">
          {course.emoji && (
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-3xl">
              {course.emoji}
            </span>
          )}
          <div className="min-w-0">
            <h1 dir="auto" className="break-words font-serif text-3xl font-semibold">
              {course.title}
            </h1>
            {course.description && (
              <p dir="auto" className="mt-2 whitespace-pre-wrap text-muted">
                {course.description}
              </p>
            )}
            <p className="mt-3 text-sm text-muted">
              {[
                t('courses.counts.files', { count: documents }),
                t('courses.counts.recordings', { count: audio }),
                t('courses.counts.links', { count: course.links.length }),
                t('courses.counts.notes', { count: course.notes.length }),
              ].join(' · ')}
            </p>
          </div>
        </div>
      </header>
    </div>
  )
}

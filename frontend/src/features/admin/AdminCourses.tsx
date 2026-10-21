import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ADMIN_COURSES_PAGE,
  fetchAdminCourse,
  fetchAdminCourseFile,
  fetchAdminCourses,
  removeAdminCourse,
} from '../../api/admin'
import type { AdminCourse, AdminCourseDetail } from '../../api/admin'
import { formatBytes } from '../../lib/bytes'
import { formatDate, parseServerDate } from '../../lib/dates'
import { secondaryButtonInline, smallSecondaryButton } from '../../components/styles'
import { UserAvatar } from '../../components/UserAvatar'
import { ReasonDialog } from './ReasonDialog'

const SEARCH_DELAY_MS = 300

// Public courses, newest first, for moderation: look inside, open files, remove with a reason.
export function AdminCourses() {
  const { t } = useTranslation()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<{ query: string; items: AdminCourse[]; total: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [removing, setRemoving] = useState<AdminCourse | null>(null)
  const trimmed = query.trim()

  useEffect(() => {
    let ignore = false
    const timer = setTimeout(() => {
      fetchAdminCourses(trimmed)
        .then((result) => {
          if (ignore) return
          setFailed(false)
          setPage({ query: trimmed, ...result })
        })
        .catch(() => !ignore && setFailed(true))
    }, trimmed ? SEARCH_DELAY_MS : 0)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [trimmed])

  async function loadMore() {
    if (!page) return
    setLoadingMore(true)
    try {
      const more = await fetchAdminCourses(page.query, page.items.length)
      setPage((current) => current && { ...current, items: [...current.items, ...more.items.filter((c) => !current.items.some((x) => x.id === c.id))] })
    } catch {
      // the button stays for another try
    } finally {
      setLoadingMore(false)
    }
  }

  async function confirmRemove(reason: string) {
    if (!removing) return
    await removeAdminCourse(removing.id, reason)
    setPage((current) => current && { ...current, items: current.items.filter((c) => c.id !== removing.id), total: current.total - 1 })
    setRemoving(null)
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">{t('admin.courses.description')}</p>
      <label htmlFor={searchId} className="sr-only">
        {t('admin.courses.search')}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('admin.courses.search')}
        maxLength={100}
        className="h-11 w-full rounded-lg border border-line bg-card px-3 placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {failed ? (
        <p className="py-8 text-center text-muted">{t('errors.generic')}</p>
      ) : !page ? (
        <p className="py-8 text-center text-muted" role="status">
          {t('feed.loading')}
        </p>
      ) : page.items.length === 0 ? (
        <p className="py-8 text-center text-muted">{t('admin.courses.empty')}</p>
      ) : (
        <>
          <p className="text-sm text-muted">{t('admin.courses.total', { count: page.total })}</p>
          <ul className="space-y-3">
            {page.items.map((course) => (
              <li key={course.id}>
                <CourseRow course={course} onRemove={() => setRemoving(course)} />
              </li>
            ))}
          </ul>
          {page.items.length < page.total && page.items.length >= ADMIN_COURSES_PAGE && (
            <div className="text-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryButtonInline}>
                {loadingMore ? t('feed.loading') : t('feed.loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      {removing && (
        <ReasonDialog
          title={t('admin.courses.removeTitle', { title: removing.title })}
          explain={t('admin.courses.removeExplain', { count: removing.members_count })}
          confirmLabel={t('admin.posts.removeConfirm')}
          onClose={() => setRemoving(null)}
          onConfirm={confirmRemove}
        />
      )}
    </section>
  )
}

function CourseRow({ course, onRemove }: { course: AdminCourse; onRemove: () => void }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<AdminCourseDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || detail) return
    fetchAdminCourse(course.id)
      .then(setDetail)
      .catch(() => setError(t('errors.generic')))
  }, [open, detail, course.id, t])

  async function openFile(materialId: number) {
    setError('')
    // opened before the download finishes, so the browser doesn't treat it as a pop-up
    const tab = window.open('', '_blank')
    try {
      const blob = await fetchAdminCourseFile(course.id, materialId)
      const url = URL.createObjectURL(blob)
      if (tab) tab.location.href = url
      else window.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      tab?.close()
      setError(t('errors.generic'))
    }
  }

  const counts = [
    t('courses.counts.files', { count: course.documents_count }),
    t('courses.counts.recordings', { count: course.audio_count }),
    t('courses.counts.links', { count: course.links_count }),
  ]

  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <UserAvatar username={course.owner.username} size={36} />
        <div className="min-w-0 flex-1 basis-56">
          <h3 dir="auto" className="break-words font-semibold">
            {course.title}
          </h3>
          <p className="text-sm text-muted">
            {course.owner.first_name} {course.owner.last_name} <span dir="ltr">@{course.owner.username}</span> ·{' '}
            <code dir="ltr">{course.share_code}</code> · {formatDate(parseServerDate(course.created_at), i18n.language)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {counts.join(' · ')} · {t('admin.courses.members', { count: course.members_count })}
          </p>
          {course.description && (
            <p dir="auto" className="mt-1 line-clamp-3 text-sm">
              {course.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={smallSecondaryButton}>
            {open ? t('admin.courses.hide') : t('admin.courses.view')}
          </button>
          <button type="button" onClick={onRemove} className={`${smallSecondaryButton} text-danger`}>
            {t('admin.courses.remove')}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
          {!detail && !error && <p className="text-muted">{t('feed.loading')}</p>}
          {detail && (
            <>
              {detail.materials.length === 0 && detail.links.length === 0 && detail.notes.length === 0 && (
                <p className="text-muted">{t('courses.counts.empty')}</p>
              )}
              {detail.materials.length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {detail.materials.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <span dir="auto" className="min-w-0 flex-1 truncate">
                        {m.file_name}
                      </span>
                      <span className="shrink-0 text-muted">{formatBytes(m.size_bytes, i18n.language)}</span>
                      <button type="button" onClick={() => openFile(m.id)} className="shrink-0 font-medium text-accent hover:underline">
                        {t('courses.materials.open')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {detail.links.length > 0 && (
                <ul className="space-y-1">
                  {detail.links.map((link, i) => (
                    <li key={i} className="truncate">
                      <span dir="auto">{link.title}</span>:{' '}
                      <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="text-accent underline">
                        {link.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {detail.notes.length > 0 && (
                <ul className="space-y-2">
                  {detail.notes.map((note, i) => (
                    <li key={i} className="rounded-xl bg-surface px-3 py-2">
                      <p dir="auto" className="font-medium">
                        {note.title || (note.kind === 'drawing' ? t('courses.notes.untitledDrawing') : t('courses.notes.untitled'))}
                      </p>
                      {note.kind === 'drawing' ? (
                        <p className="text-muted">{t('courses.notes.drawing')}</p>
                      ) : (
                        <p dir="auto" className="line-clamp-4 whitespace-pre-wrap break-words text-muted">
                          {note.content}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

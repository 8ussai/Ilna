import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { fetchCourse, fetchMaterials, updateCourse } from '../api/courses'
import type { CourseDetail, CourseMaterial } from '../api/courses'
import { AiRail } from '../components/courses/AiRail'
import { CourseDetailsForm } from '../components/courses/CourseDetailsForm'
import { courseColorClass } from '../components/courses/courseColors'
import { LinksTab } from '../components/courses/LinksTab'
import { MaterialsTab } from '../components/courses/MaterialsTab'
import { NotesTab } from '../components/courses/NotesTab'
import { VoiceTab } from '../components/courses/VoiceTab'
import { Dialog } from '../components/Dialog'
import { secondaryButtonInline, smallSecondaryButton } from '../components/styles'
import { inAppClick } from '../links'
import { COURSE_SECTIONS, tabPath } from '../tabs'
import type { CourseSection } from '../tabs'

type Status = 'loading' | 'ready' | 'error' | 'unavailable'

// polling starts quick and slows down; work that never finishes (e.g. indexing that keeps failing) stops being polled
const POLL_FIRST_MS = 3000
const POLL_MAX_MS = 30_000
const POLL_GIVE_UP_MS = 15 * 60_000

type CoursePageProps = {
  courseId: number
  section: CourseSection
  onSectionChange: (section: CourseSection) => void
  onBack: () => void
}

export function CoursePage({ courseId, section, onSectionChange, onBack }: CoursePageProps) {
  const { t } = useTranslation()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(false)

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

  const materials = course?.materials ?? []
  const needsPolling = materials.some(isStillWorking)

  // refresh indexing and transcription status while something is still in progress
  useEffect(() => {
    if (!needsPolling) return
    let delay = POLL_FIRST_MS
    let timer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()
    let stopped = false

    const tick = async () => {
      try {
        const fresh = await fetchMaterials(courseId)
        if (stopped) return
        const byId = new Map(fresh.map((m) => [m.id, m]))
        // only update what's already shown; a just-finished upload may not be in this response yet
        setCourse((current) => current && { ...current, materials: current.materials.map((m) => byId.get(m.id) ?? m) })
      } catch {
        // try again on the next tick
      }
      if (stopped || Date.now() - startedAt > POLL_GIVE_UP_MS) return
      delay = Math.min(delay * 1.5, POLL_MAX_MS)
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, delay)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
    // a new upload restarts at the quick interval
  }, [needsPolling, courseId, materials.length])

  const back = (
    <a href={tabPath('my-courses')} onClick={inAppClick(onBack)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {t('courses.back')}
    </a>
  )

  if (status !== 'ready' || !course) {
    return (
      <div className="space-y-4">
        {back}
        {status === 'loading' ? (
          <p className="py-10 text-center text-muted" role="status">
            {t('feed.loading')}
          </p>
        ) : (
          <div className="py-10 text-center">
            <p className="text-muted">{status === 'unavailable' ? t('courses.unavailable') : t('courses.loadOneFailed')}</p>
            {status === 'error' && (
              <button
                type="button"
                onClick={() => {
                  setStatus('loading')
                  setReloadKey((k) => k + 1)
                }}
                className={`${secondaryButtonInline} mt-4`}
              >
                {t('auth.retry')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const update = (changes: Partial<CourseDetail>) => setCourse((current) => current && { ...current, ...changes })
  const addMaterial = (material: CourseMaterial) => update({ materials: [material, ...materials] })
  const changeMaterial = (material: CourseMaterial) => update({ materials: materials.map((m) => (m.id === material.id ? material : m)) })
  const removeMaterial = (id: number) => update({ materials: materials.filter((m) => m.id !== id) })

  const byNewest = [...materials].sort((a, b) => b.id - a.id)
  const documents = byNewest.filter((m) => m.kind === 'document')
  const recordings = byNewest.filter((m) => m.kind === 'audio')
  const notes = [...course.notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const counts: Record<CourseSection, number> = {
    materials: documents.length,
    links: course.links.length,
    voice: recordings.length,
    notes: notes.length,
  }

  return (
    // room under the content for the AI bar along the bottom on phones
    <div className="space-y-5 pb-24 sm:pb-0">
      {back}

      <header className="overflow-hidden rounded-2xl border border-line bg-card">
        <div aria-hidden="true" className={`h-2 ${courseColorClass(course.color)}`} />
        <div className="flex items-start gap-4 p-5">
          {course.emoji && (
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-3xl">
              {course.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 dir="auto" className="break-words font-serif text-3xl font-semibold">
              {course.title}
            </h1>
            {course.description && (
              <p dir="auto" className="mt-2 whitespace-pre-wrap text-muted">
                {course.description}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setEditing(true)} className={`${smallSecondaryButton} shrink-0`}>
            {t('courses.edit')}
          </button>
        </div>
      </header>

      <div className="flex gap-6">
        <AiRail />

        <div className="min-w-0 flex-1">
          <SectionTabs section={section} counts={counts} onSelect={onSectionChange} />
          <div id={`course-panel-${section}`} role="tabpanel" aria-labelledby={`course-tab-${section}`} className="pt-5">
            {section === 'materials' && (
              <MaterialsTab courseId={course.id} materials={documents} onAdded={addMaterial} onChanged={changeMaterial} onDeleted={removeMaterial} />
            )}
            {section === 'links' && (
              <LinksTab
                courseId={course.id}
                links={course.links}
                onAdded={(link) => update({ links: [...course.links, link] })}
                onChanged={(link) => update({ links: course.links.map((l) => (l.id === link.id ? link : l)) })}
                onDeleted={(id) => update({ links: course.links.filter((l) => l.id !== id) })}
              />
            )}
            {section === 'voice' && (
              <VoiceTab courseId={course.id} recordings={recordings} onAdded={addMaterial} onChanged={changeMaterial} onDeleted={removeMaterial} />
            )}
            {section === 'notes' && (
              <NotesTab
                courseId={course.id}
                notes={notes}
                onSaved={(note) =>
                  update({ notes: course.notes.some((n) => n.id === note.id) ? course.notes.map((n) => (n.id === note.id ? note : n)) : [note, ...course.notes] })
                }
                onDeleted={(id) => update({ notes: course.notes.filter((n) => n.id !== id) })}
              />
            )}
          </div>
        </div>
      </div>

      {editing && (
        <Dialog title={t('courses.editTitle')} onClose={() => setEditing(false)}>
          <CourseDetailsForm
            initial={course}
            submitLabel={t('courses.form.save')}
            onSubmit={async (input) => {
              update(await updateCourse(course.id, input))
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        </Dialog>
      )}
    </div>
  )
}

// still being indexed, or a recording still being transcribed (or indexed after it)
function isStillWorking(material: CourseMaterial) {
  if (material.kind === 'document') return !material.is_rag_indexed
  const transcript = material.transcript
  if (!transcript) return false
  if (transcript.status === 'pending' || transcript.status === 'processing') return true
  // a saved transcript whose indexing failed has an error and won't change until a restart
  return transcript.status === 'done' && !material.is_rag_indexed && !transcript.error
}

// The ARIA tabs pattern: arrow keys move between tabs (mirrored in Arabic), Home/End jump to the ends.
function SectionTabs({
  section,
  counts,
  onSelect,
}: {
  section: CourseSection
  counts: Record<CourseSection, number>
  onSelect: (section: CourseSection) => void
}) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = COURSE_SECTIONS.indexOf(section)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    let next: number | null = null
    if (e.key === 'ArrowRight') next = index + (rtl ? -1 : 1)
    else if (e.key === 'ArrowLeft') next = index + (rtl ? 1 : -1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = COURSE_SECTIONS.length - 1
    if (next === null) return
    e.preventDefault()
    const target = COURSE_SECTIONS[(next + COURSE_SECTIONS.length) % COURSE_SECTIONS.length]
    onSelect(target)
    listRef.current?.querySelector<HTMLElement>(`#course-tab-${target}`)?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t('courses.tabs.label')}
      onKeyDown={onKeyDown}
      className="-mb-px flex gap-1 overflow-x-auto border-b border-line"
    >
      {COURSE_SECTIONS.map((name) => {
        const selected = name === section
        return (
          <button
            key={name}
            id={`course-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`course-panel-${name}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(name)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
              selected ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t(`courses.tabs.${name}`)}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${selected ? 'bg-accent text-accent-fg' : 'bg-surface text-muted'}`}>
              {counts[name]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

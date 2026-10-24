import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { leaveCourse } from '../../api/courseSharing'
import { fetchCourse, fetchMaterials, updateCourse } from '../../api/courses'
import type { CourseDetail, CourseMaterial } from '../../api/courses'
import { fetchStudyItems, isStudyItemWorking } from '../../api/study'
import type { StudyItemSummary, StudyKind } from '../../api/study'
import { AiRail } from './AiRail'
import { CourseDetailsForm } from './CourseDetailsForm'
import { CourseCanDownloadNotesContext, CourseCanEditContext } from './courseAccess'
import { ShareDialog } from './ShareDialog'
import { DeleteButton } from '../../components/DeleteButton'
import { UserName } from '../account/Premium'
import { courseColorClass } from './courseColors'
import { GenerateDialog } from './GenerateDialog'
import { LinksTab } from './LinksTab'
import { MaterialsTab } from './MaterialsTab'
import { NotesTab } from './NotesTab'
import { StudyTab } from './StudyTab'
import { VoiceTab } from './VoiceTab'
import { Dialog } from '../../components/Dialog'
import { secondaryButtonInline, smallSecondaryButton } from '../../components/styles'
import { usePolling } from '../../hooks/usePolling'
import { inAppClick } from '../../lib/links'
import { COURSE_SECTIONS, STUDY_SECTIONS, tabPath } from '../../lib/tabs'
import type { CourseSection } from '../../lib/tabs'

type Status = 'loading' | 'ready' | 'error' | 'unavailable'

type CoursePageProps = {
  courseId: number
  section: CourseSection
  // a summary or quiz open on its own page in its tab
  studyItemId: number | null
  // itemId opens a summary or quiz in the summaries or quizzes tab
  onSectionChange: (section: CourseSection, itemId?: number | null) => void
  onBack: () => void
}

// a course: header, tabs for its files, links, recordings, notes, summaries and quizzes
export function CoursePage({ courseId, section, studyItemId, onSectionChange, onBack }: CoursePageProps) {
  const { t } = useTranslation()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(false)
  const [sharingOpen, setSharingOpen] = useState(false)
  const [studyItems, setStudyItems] = useState<StudyItemSummary[]>([])
  const [studyLoaded, setStudyLoaded] = useState(false)
  // the summary or quiz being set up in the generate dialog
  const [generating, setGenerating] = useState<StudyKind | null>(null)

  // its own request, so the course still opens if this one fails; the tab then just stays hidden
  useEffect(() => {
    let ignore = false
    fetchStudyItems(courseId)
      .then((items) => {
        if (ignore) return
        setStudyItems(items)
        setStudyLoaded(true)
      })
      .catch(() => {
        if (!ignore) setStudyLoaded(true)
      })
    return () => {
      ignore = true
    }
  }, [courseId, reloadKey])

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

  // refresh indexing and transcription status while something is still in progress; a new upload restarts it
  usePolling(
    needsPolling,
    async () => {
      const fresh = await fetchMaterials(courseId)
      const byId = new Map(fresh.map((m) => [m.id, m]))
      // only update what's already shown; a just-finished upload may not be in this response yet
      setCourse((current) => current && { ...current, materials: current.materials.map((m) => byId.get(m.id) ?? m) })
    },
    materials.length,
  )

  // and summaries or quizzes still being written or translated
  usePolling(
    studyItems.some(isStudyItemWorking),
    async () => {
      const fresh = await fetchStudyItems(courseId)
      const byId = new Map(fresh.map((i) => [i.id, i]))
      // like materials: one deleted meanwhile stays deleted
      setStudyItems((current) => current.map((i) => byId.get(i.id) ?? i))
    },
    studyItems.length,
  )

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

  // updates the course on screen
  const update = (changes: Partial<CourseDetail>) => setCourse((current) => current && { ...current, ...changes })
  // adds a new file or recording to the list
  const addMaterial = (material: CourseMaterial) => update({ materials: [material, ...materials] })
  // replaces a changed file or recording
  const changeMaterial = (material: CourseMaterial) => update({ materials: materials.map((m) => (m.id === material.id ? material : m)) })
  // takes a deleted file or recording off the list
  const removeMaterial = (id: number) => update({ materials: materials.filter((m) => m.id !== id) })

  const byNewest = [...materials].sort((a, b) => b.id - a.id)
  const documents = byNewest.filter((m) => m.kind === 'document')
  const recordings = byNewest.filter((m) => m.kind === 'audio')
  const notes = [...course.notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const summaries = studyItems.filter((i) => i.kind === 'summary')
  const quizzes = studyItems.filter((i) => i.kind === 'quiz')
  const counts: Record<CourseSection, number> = {
    materials: documents.length,
    links: course.links.length,
    recordings: recordings.length,
    notes: notes.length,
    summaries: summaries.length,
    quizzes: quizzes.length,
  }
  const canEdit = course.is_owner
  // the summaries and quizzes tabs each appear with their first item (or when their link is opened directly)
  const sections = COURSE_SECTIONS.filter((name) => counts[name] > 0 || name === section || !(name === 'summaries' || name === 'quizzes'))
  const shownSection: CourseSection = sections.includes(section) ? section : 'materials'

  // opens a new summary or quiz in its tab
  function openStudyItem(item: StudyItemSummary) {
    setStudyItems((current) => [item, ...current])
    setGenerating(null)
    onSectionChange(STUDY_SECTIONS[item.kind])
  }
  // replaces a changed summary or quiz
  const changeStudyItem = (item: StudyItemSummary) => setStudyItems((current) => current.map((i) => (i.id === item.id ? item : i)))
  // takes a deleted summary or quiz off the list
  const removeStudyItem = (id: number) => setStudyItems((current) => current.filter((i) => i.id !== id))

  return (
    // room under the content for the AI bar along the bottom on phones
    <div className="space-y-5 pb-24 sm:pb-0">
      {back}

      <header className="overflow-hidden rounded-2xl border border-line bg-card">
        <div aria-hidden="true" className={`h-2 ${courseColorClass(course.color)}`} />
        {/* on phones the buttons go under the title, so they don't squeeze it into broken words */}
        <div className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:gap-4">
          <div className="w-full min-w-0 flex-1">
            <h1 dir="auto" className="break-words font-serif text-2xl font-semibold sm:text-3xl">
              {course.title}
            </h1>
            {course.description && (
              <p dir="auto" className="mt-2 whitespace-pre-wrap text-muted">
                {course.description}
              </p>
            )}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <button type="button" onClick={() => setSharingOpen(true)} className={smallSecondaryButton}>
                {course.is_public ? t('courses.share.buttonPublic') : t('courses.share.button')}
              </button>
              <button type="button" onClick={() => setEditing(true)} className={smallSecondaryButton}>
                {t('courses.edit')}
              </button>
            </div>
          ) : (
            <DeleteButton
              label={t('courses.shared.leave')}
              question={t('courses.shared.leaveConfirm')}
              onConfirm={async () => {
                await leaveCourse(course.id)
                onBack()
              }}
            />
          )}
        </div>
        {!canEdit && course.owner && (
          <p className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-sm text-muted">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{t('courses.shared.tag')}</span>
            <span>
              {t('courses.shared.by')} <UserName user={course.owner} className="font-medium text-fg" />{' '}
              <span dir="ltr">@{course.owner.username}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{t('courses.shared.readOnly')}</span>
          </p>
        )}
      </header>

      <CourseCanEditContext.Provider value={canEdit}>
      <CourseCanDownloadNotesContext.Provider value={canEdit || course.notes_downloadable}>
      <div className="flex gap-6">
        {canEdit && <AiRail onUse={(feature) => feature !== 'voice' && setGenerating(feature === 'summarize' ? 'summary' : 'quiz')} />}

        <div className="min-w-0 flex-1">
          <SectionTabs sections={sections} section={shownSection} counts={counts} onSelect={onSectionChange} />
          <div id={`course-panel-${shownSection}`} role="tabpanel" aria-labelledby={`course-tab-${shownSection}`} className="pt-5">
            {shownSection === 'materials' && (
              <MaterialsTab courseId={course.id} materials={documents} onAdded={addMaterial} onChanged={changeMaterial} onDeleted={removeMaterial} />
            )}
            {shownSection === 'links' && (
              <LinksTab
                courseId={course.id}
                links={course.links}
                onAdded={(link) => update({ links: [...course.links, link] })}
                onChanged={(link) => update({ links: course.links.map((l) => (l.id === link.id ? link : l)) })}
                onDeleted={(id) => update({ links: course.links.filter((l) => l.id !== id) })}
              />
            )}
            {shownSection === 'recordings' && (
              <VoiceTab courseId={course.id} recordings={recordings} onAdded={addMaterial} onChanged={changeMaterial} onDeleted={removeMaterial} />
            )}
            {shownSection === 'notes' && (
              <NotesTab
                courseId={course.id}
                notes={notes}
                onSaved={(note) =>
                  update({ notes: course.notes.some((n) => n.id === note.id) ? course.notes.map((n) => (n.id === note.id ? note : n)) : [note, ...course.notes] })
                }
                onDeleted={(id) => update({ notes: course.notes.filter((n) => n.id !== id) })}
              />
            )}
            {(shownSection === 'summaries' || shownSection === 'quizzes') && (
              <StudyTab
                key={shownSection}
                courseId={course.id}
                kind={shownSection === 'summaries' ? 'summary' : 'quiz'}
                items={shownSection === 'summaries' ? summaries : quizzes}
                loaded={studyLoaded}
                openId={studyItemId}
                onOpen={(itemId) => onSectionChange(shownSection, itemId)}
                onChanged={changeStudyItem}
                onDeleted={removeStudyItem}
              />
            )}
          </div>
        </div>
      </div>
      </CourseCanDownloadNotesContext.Provider>
      </CourseCanEditContext.Provider>

      {sharingOpen && (
        <ShareDialog
          courseId={course.id}
          onClose={() => setSharingOpen(false)}
          onChanged={(sharing) =>
            update({ is_public: sharing.is_public, notes_downloadable: sharing.notes_downloadable, share_code: sharing.share_code })
          }
        />
      )}

      {generating && (
        <GenerateDialog
          kind={generating}
          courseId={course.id}
          materials={materials}
          notes={course.notes}
          onClose={() => setGenerating(null)}
          onCreated={openStudyItem}
        />
      )}

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
  sections,
  section,
  counts,
  onSelect,
}: {
  sections: CourseSection[]
  section: CourseSection
  counts: Record<CourseSection, number>
  onSelect: (section: CourseSection) => void
}) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)

  // on a phone the tabs scroll sideways, and a tab opened by the page (e.g. a new summary) may be out of sight
  useEffect(() => {
    listRef.current?.querySelector(`#course-tab-${section}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [section])

  // arrow keys and Home/End move between tabs
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = sections.indexOf(section)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    let next: number | null = null
    if (e.key === 'ArrowRight') next = index + (rtl ? -1 : 1)
    else if (e.key === 'ArrowLeft') next = index + (rtl ? 1 : -1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = sections.length - 1
    if (next === null) return
    e.preventDefault()
    const target = sections[(next + sections.length) % sections.length]
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
      {sections.map((name) => {
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

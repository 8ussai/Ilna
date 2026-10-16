import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AUDIO_EXTENSIONS, createCourse, DOCUMENT_EXTENSIONS, isAudio, MAX_UPLOAD_BYTES } from '../../api/courses'
import type { Course, CourseLink } from '../../api/courses'
import { formatBytes } from '../../bytes'
import { Dialog } from '../Dialog'
import { primaryButton } from '../styles'
import { CourseDetailsForm } from './CourseDetailsForm'
import { LinkForm } from './LinkForm'
import type { LinkFormHandle } from './courseLinks'
import { CheckIcon, DropZone, UploadList } from './Uploader'
import { acceptList, extensionList, useUploadQueue } from './uploadQueue'

type NewCourseDialogProps = {
  // the course was created but the dialog closed without "Done"; whatever was saved stays
  onClose: (created: Course | null) => void
  onDone: (course: Course) => void
}

// Step 1 creates the course; step 2 optionally adds files, links and recordings to it.
// Closing stops any upload still running (the step unmounts).
export function NewCourseDialog({ onClose, onDone }: NewCourseDialogProps) {
  const { t } = useTranslation()
  const [course, setCourse] = useState<Course | null>(null)

  return (
    <Dialog
      title={course ? t('courses.new.addTitle') : t('courses.new.title')}
      onClose={() => onClose(course)}
      size={course ? 'lg' : 'sm'}
    >
      {course ? (
        <AddContentStep course={course} onDone={() => onDone(course)} />
      ) : (
        <CourseDetailsForm
          submitLabel={t('courses.new.create')}
          onSubmit={async (input) => setCourse(await createCourse(input))}
          onCancel={() => onClose(null)}
        />
      )}
    </Dialog>
  )
}

function AddContentStep({ course, onDone }: { course: Course; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const { uploads, storageLeft, busy, addFiles, retry } = useUploadQueue({ courseId: course.id })
  const [links, setLinks] = useState<CourseLink[]>([])
  const [finishing, setFinishing] = useState(false)
  const linkFormRef = useRef<LinkFormHandle>(null)
  const introRef = useRef<HTMLDivElement>(null)

  // the Create button that had focus is gone, so start step 2 at its intro
  useEffect(() => introRef.current?.focus(), [])

  async function finish() {
    setFinishing(true)
    const saved = (await linkFormRef.current?.flush()) ?? true
    setFinishing(false)
    if (saved) onDone()
  }

  return (
    <div className="space-y-6">
      <div ref={introRef} tabIndex={-1} className="rounded-xl bg-surface px-4 py-3 text-sm focus:outline-none">
        <p>{t('courses.new.created', { title: course.title })}</p>
        <p className="mt-0.5 text-muted">
          {t('courses.new.optionalHint')}
          {storageLeft !== null && <> {t('settings.storage.left', { left: formatBytes(storageLeft, i18n.language) })}</>}
        </p>
      </div>

      <section aria-labelledby="new-course-materials" className="space-y-3">
        <h3 id="new-course-materials" className="font-semibold">
          {t('courses.new.materials')}
        </h3>
        <DropZone
          label={t('courses.new.dropFiles')}
          hint={t('courses.new.fileTypes', { types: extensionList(DOCUMENT_EXTENSIONS), max: formatBytes(MAX_UPLOAD_BYTES, i18n.language) })}
          accept={acceptList(DOCUMENT_EXTENSIONS)}
          onFiles={(files) => addFiles(files, DOCUMENT_EXTENSIONS)}
        />
        <UploadList items={uploads.filter((u) => !isAudio(u.file.name))} onRetry={retry} />
      </section>

      <section aria-labelledby="new-course-links" className="space-y-3">
        <h3 id="new-course-links" className="font-semibold">
          {t('courses.new.links')}
        </h3>
        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((link) => (
              <li key={link.id} className="flex items-center gap-2 text-sm">
                <CheckIcon />
                <span dir="auto" className="font-medium">
                  {link.title}
                </span>
                <span dir="ltr" className="min-w-0 truncate text-muted">
                  {link.url}
                </span>
              </li>
            ))}
          </ul>
        )}
        <LinkForm courseId={course.id} ref={linkFormRef} onAdded={(link) => setLinks((current) => [...current, link])} />
      </section>

      <section aria-labelledby="new-course-voice" className="space-y-3">
        <h3 id="new-course-voice" className="font-semibold">
          {t('courses.new.voice')}
        </h3>
        <DropZone
          label={t('courses.new.dropAudio')}
          hint={t('courses.new.audioHint', { types: extensionList(AUDIO_EXTENSIONS), max: formatBytes(MAX_UPLOAD_BYTES, i18n.language) })}
          accept={['audio/*', acceptList(AUDIO_EXTENSIONS)].join(',')}
          onFiles={(files) => addFiles(files, AUDIO_EXTENSIONS)}
        />
        <UploadList items={uploads.filter((u) => isAudio(u.file.name))} onRetry={retry} />
      </section>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" role="status">
          {busy ? t('courses.upload.waiting') : ''}
        </p>
        <button type="button" onClick={finish} disabled={busy || finishing} className={`${primaryButton} sm:w-auto`}>
          {t('courses.new.done')}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { deleteMaterial, DOCUMENT_EXTENSIONS, downloadName, fileExtension, MAX_UPLOAD_BYTES, renameMaterial } from '../../api/courses'
import type { CourseMaterial } from '../../api/courses'
import { formatBytes } from '../../bytes'
import { formatDate, parseServerDate } from '../../dates'
import { DeleteButton } from '../DeleteButton'
import { secondaryButtonInline } from '../styles'
import { InlineRename } from './InlineRename'
import { DropZone, UploadList } from './Uploader'
import { acceptList, extensionList, useUploadQueue } from './uploadQueue'
import { downloadMaterial, useMaterialUrl } from './useMaterialUrl'

type MaterialsTabProps = {
  courseId: number
  // documents only, newest first
  materials: CourseMaterial[]
  onAdded: (material: CourseMaterial) => void
  onChanged: (material: CourseMaterial) => void
  onDeleted: (materialId: number) => void
}

export function MaterialsTab({ courseId, materials, onAdded, onChanged, onDeleted }: MaterialsTabProps) {
  const { t, i18n } = useTranslation()
  const { uploads, addFiles, retry, dismiss } = useUploadQueue({ courseId, onUploaded: onAdded, keepDone: false })
  const [viewingId, setViewingId] = useState<number | null>(null)
  const viewing = materials.find((m) => m.id === viewingId) ?? null

  return (
    <div className="space-y-4">
      {viewing && <PdfViewer courseId={courseId} material={viewing} onClose={() => setViewingId(null)} />}

      <DropZone
        compact
        label={t('courses.materials.add')}
        hint={t('courses.new.fileTypes', { types: extensionList(DOCUMENT_EXTENSIONS), max: formatBytes(MAX_UPLOAD_BYTES, i18n.language) })}
        accept={acceptList(DOCUMENT_EXTENSIONS)}
        onFiles={(files) => addFiles(files, DOCUMENT_EXTENSIONS)}
      />
      <UploadList items={uploads} onRetry={retry} onDismiss={dismiss} />

      {materials.length === 0 && uploads.length === 0 ? (
        <p className="py-8 text-center text-muted">{t('courses.materials.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {materials.map((material) => (
            <MaterialRow
              key={material.id}
              courseId={courseId}
              material={material}
              viewing={material.id === viewingId}
              onView={() => setViewingId(material.id)}
              onChanged={onChanged}
              onDeleted={() => {
                if (material.id === viewingId) setViewingId(null)
                onDeleted(material.id)
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function MaterialRow({
  courseId,
  material,
  viewing,
  onView,
  onChanged,
  onDeleted,
}: {
  courseId: number
  material: CourseMaterial
  viewing: boolean
  onView: () => void
  onChanged: (material: CourseMaterial) => void
  onDeleted: () => void
}) {
  const { t, i18n } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const extension = (material.mime_type === 'application/pdf' ? 'pdf' : fileExtension(downloadName(material))) || 'file'
  const isPdf = material.mime_type === 'application/pdf'

  async function download() {
    setDownloading(true)
    setError('')
    try {
      await downloadMaterial(courseId, material.id, downloadName(material))
    } catch {
      setError(t('courses.materials.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }

  async function remove() {
    setError('')
    try {
      await deleteMaterial(courseId, material.id)
    } catch (err) {
      // already gone counts as deleted
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(t('errors.generic'))
        return
      }
    }
    onDeleted()
  }

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${viewing ? 'bg-surface' : ''}`}>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-[10px] font-bold uppercase tracking-wide text-muted"
      >
        {extension}
      </span>

      {renaming ? (
        <InlineRename
          value={material.file_name}
          label={t('courses.materials.renameLabel')}
          maxLength={255}
          onSave={async (name) => onChanged(await renameMaterial(courseId, material.id, name))}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <div className="min-w-0 flex-1 basis-48">
          <p dir="auto" className="truncate font-medium">
            {material.file_name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>{formatBytes(material.size_bytes, i18n.language)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDate(parseServerDate(material.created_at), i18n.language)}</span>
            <IndexBadge ready={material.is_rag_indexed} />
          </p>
          {error && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      {!renaming && (
        <div className="-me-2 flex shrink-0 flex-wrap items-center gap-1">
          {isPdf ? (
            <button type="button" onClick={onView} aria-pressed={viewing} className="rounded-md px-2 py-1 text-sm font-medium hover:bg-surface">
              {t('courses.materials.open')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg disabled:opacity-50"
          >
            {downloading ? t('auth.working') : t('courses.materials.download')}
          </button>
          <button type="button" onClick={() => setRenaming(true)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
            {t('courses.menu.rename')}
          </button>
          <DeleteButton question={t('courses.materials.confirmDelete')} onConfirm={remove} />
        </div>
      )}
    </li>
  )
}

// shown only while it's still being prepared (a ready file shows nothing), in words as well as the pulsing dot
export function IndexBadge({ ready }: { ready: boolean }) {
  const { t } = useTranslation()
  if (ready) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
      <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-muted" />
      {t('courses.materials.indexing')}
    </span>
  )
}

// The browser's own PDF viewer, in a frame, from a fetched copy of the file.
function PdfViewer({ courseId, material, onClose }: { courseId: number; material: CourseMaterial; onClose: () => void }) {
  const { t } = useTranslation()
  const file = useMaterialUrl(courseId, material.id, true)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // move to the viewer, which opens above the list
  useEffect(() => {
    headingRef.current?.focus()
    headingRef.current?.scrollIntoView({ block: 'nearest' })
  }, [material.id])

  return (
    <section aria-labelledby="pdf-viewer-title" className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h3 id="pdf-viewer-title" ref={headingRef} tabIndex={-1} dir="auto" className="min-w-0 flex-1 truncate font-medium focus:outline-none">
          {material.file_name}
        </h3>
        {file.url && (
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
            {t('courses.materials.newTab')}
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('courses.materials.closeViewer')}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {file.status === 'ready' && file.url ? (
        <iframe src={file.url} title={material.file_name} className="block h-[75vh] w-full bg-surface" />
      ) : file.status === 'error' ? (
        <div className="py-16 text-center">
          <p className="text-muted">{t('courses.materials.openFailed')}</p>
          <button type="button" onClick={file.retry} className={`${secondaryButtonInline} mt-4`}>
            {t('auth.retry')}
          </button>
        </div>
      ) : (
        <p className="py-16 text-center text-muted" role="status">
          {t('feed.loading')}
        </p>
      )}
    </section>
  )
}

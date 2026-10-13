import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { fileExtension, isAudio, uploadCourseMaterial } from '../../api/courses'
import type { CourseMaterial } from '../../api/courses'
import { fetchStorage } from '../../api/me'

type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'

export type Upload = {
  key: number
  file: File
  // known for browser recordings; read from the file otherwise
  durationSec?: number | null
  progress: number
  status: UploadStatus
  error?: string
  // a wrong file type fails the same way every time
  retryable?: boolean
}

type UploadQueueOptions = {
  courseId: number
  onUploaded?: (material: CourseMaterial) => void
  // the workspace drops finished rows, since the file then shows in its list
  keepDone?: boolean
}

// Uploads files to a course one at a time, with progress per file. Unfinished uploads stop on unmount.
export function useUploadQueue({ courseId, onUploaded, keepDone = true }: UploadQueueOptions) {
  const { t } = useTranslation()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [storageLeft, setStorageLeft] = useState<number | null>(null)

  // the queue lives in refs so the one-at-a-time worker always sees the latest list
  const queueRef = useRef<Upload[]>([])
  const runningRef = useRef(false)
  const leftRef = useRef<number | null>(null)
  const nextKey = useRef(1)
  const controllerRef = useRef<AbortController | null>(null)
  const onUploadedRef = useRef(onUploaded)

  useEffect(() => {
    onUploadedRef.current = onUploaded
  })

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    fetchStorage()
      .then((s) => {
        leftRef.current = Math.max(0, s.limit_bytes - s.used_bytes)
        setStorageLeft(leftRef.current)
      })
      // without it the server still enforces the limit; the line that shows it just stays hidden
      .catch(() => {})
    return () => controller.abort()
  }, [])

  function setQueue(next: Upload[]) {
    queueRef.current = next
    setUploads(next)
  }

  function update(key: number, changes: Partial<Upload>) {
    setQueue(queueRef.current.map((u) => (u.key === key ? { ...u, ...changes } : u)))
  }

  async function pump() {
    if (runningRef.current) return
    runningRef.current = true
    try {
      for (;;) {
        const next = queueRef.current.find((u) => u.status === 'queued')
        if (!next) break
        await uploadOne(next)
      }
    } finally {
      runningRef.current = false
    }
  }

  async function uploadOne(item: Upload) {
    const { file, key } = item
    if (leftRef.current !== null && file.size > leftRef.current) {
      update(key, { status: 'failed', error: t('courses.upload.noSpace'), retryable: true })
      return
    }
    update(key, { status: 'uploading', progress: 0 })
    try {
      const durationSec = item.durationSec ?? (isAudio(file.name) ? await audioDuration(file) : null)
      const material = await uploadCourseMaterial(courseId, file, {
        durationSec,
        signal: controllerRef.current?.signal,
        onProgress: (progress) => update(key, { progress }),
      })
      if (keepDone) update(key, { status: 'done', progress: 1 })
      else setQueue(queueRef.current.filter((u) => u.key !== key))
      if (leftRef.current !== null) {
        leftRef.current = Math.max(0, leftRef.current - material.size_bytes)
        setStorageLeft(leftRef.current)
      }
      onUploadedRef.current?.(material)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        update(key, { status: 'cancelled' })
        return
      }
      let error = t('courses.upload.failed')
      if (err instanceof ApiError) {
        if (err.status === 0) error = t('errors.network')
        else if (err.status === 413) error = t('courses.upload.noSpace')
        else if (err.status === 400) error = t('courses.upload.badType')
      }
      update(key, { status: 'failed', error, retryable: !(err instanceof ApiError && err.status === 400) })
    }
  }

  // files whose extension isn't in `allowed` are listed as failed instead of uploaded
  function addFiles(files: File[], allowed: string[], durationSec?: number | null) {
    const added: Upload[] = files.map((file) => {
      const ok = allowed.includes(fileExtension(file.name))
      return {
        key: nextKey.current++,
        file,
        durationSec,
        progress: 0,
        status: ok ? 'queued' : 'failed',
        error: ok ? undefined : t('courses.upload.badType'),
        retryable: ok,
      }
    })
    setQueue([...queueRef.current, ...added])
    pump()
  }

  function retry(key: number) {
    update(key, { status: 'queued', error: undefined, progress: 0 })
    pump()
  }

  function dismiss(key: number) {
    setQueue(queueRef.current.filter((u) => u.key !== key))
  }

  const busy = uploads.some((u) => u.status === 'queued' || u.status === 'uploading')

  return { uploads, storageLeft, busy, addFiles, retry, dismiss }
}

// ".pdf, .ppt" kept left-to-right inside Arabic text, where the dots would otherwise jump to the wrong end
export function extensionList(extensions: string[]) {
  return `⁦${extensions.map((e) => `.${e}`).join(', ')}⁩`
}

export function acceptList(extensions: string[]) {
  return extensions.map((e) => `.${e}`).join(',')
}

// the backend stores the length the browser reports; null when it can't be read
function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), 5000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}

import { useEffect, useState } from 'react'

import { fetchMaterialFile } from '../../api/courses'
import { saveBlob } from '../../lib/saveBlob'

type MaterialUrl = { status: 'idle' | 'loading' | 'ready' | 'error'; url: string | null; retry: () => void }

// Files are only served with the auth header, so the PDF viewer and audio player get an object URL
// for a fetched copy instead of a link. Nothing loads until `enabled`; the URL is released on unmount.
export function useMaterialUrl(courseId: number, materialId: number, enabled: boolean): MaterialUrl {
  const [attempt, setAttempt] = useState(0)
  // which request the result belongs to, so a new file or a retry reads as loading until its own result lands
  const request = `${courseId}/${materialId}/${attempt}`
  const [result, setResult] = useState<{ request: string; url: string | null }>({ request: '', url: null })

  useEffect(() => {
    if (!enabled) return
    let url: string | null = null
    let ignore = false
    fetchMaterialFile(courseId, materialId)
      .then((blob) => {
        if (ignore) return
        url = URL.createObjectURL(blob)
        setResult({ request, url })
      })
      .catch(() => {
        if (!ignore) setResult({ request, url: null })
      })
    return () => {
      ignore = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [courseId, materialId, enabled, request])

  // fetches the file again
  const retry = () => setAttempt((n) => n + 1)
  if (!enabled) return { status: 'idle', url: null, retry }
  if (result.request !== request) return { status: 'loading', url: null, retry }
  return { status: result.url ? 'ready' : 'error', url: result.url, retry }
}

// saves a fetched file under its name (PPT can't be shown in the browser)
export async function downloadMaterial(courseId: number, materialId: number, fileName: string) {
  saveBlob(await fetchMaterialFile(courseId, materialId), fileName)
}

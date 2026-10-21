import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

type AutosaveOptions<T> = {
  // wait this long after the last change before saving
  delay?: number
  // keep it the same function between renders (define it outside the component)
  isEqual?: (a: T, b: T) => boolean
}

const RETRY_FIRST_MS = 2000
const RETRY_MAX_MS = 30_000

// Saves `value` a moment after it stops changing, one save at a time. A failed save keeps the local
// value, retries with backoff (and as soon as the browser is back online), and the page warns before
// closing while anything is unsaved. `flush` saves right away, e.g. on blur or before leaving.
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, options: AutosaveOptions<T> = {}) {
  const { delay = 1000, isEqual = Object.is } = options
  const [savedValue, setSavedValue] = useState(value)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const latestRef = useRef(value)
  const savedRef = useRef(value)
  const saveRef = useRef(save)
  const isEqualRef = useRef(isEqual)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryDelayRef = useRef(RETRY_FIRST_MS)

  useLayoutEffect(() => {
    latestRef.current = value
    saveRef.current = save
    isEqualRef.current = isEqual
  })

  // whether what's on screen differs from what was last saved
  const isDirty = () => !isEqualRef.current(latestRef.current, savedRef.current)

  // true once what's on screen is saved; false if this attempt failed
  const flush = useCallback(function run(): Promise<boolean> {
    clearTimeout(timerRef.current)
    // one save at a time; after a failed one, wait for its scheduled retry instead of trying again at once
    if (inFlightRef.current) return inFlightRef.current.then((ok) => (ok ? run() : false))
    if (!isDirty()) return Promise.resolve(true)

    const snapshot = latestRef.current
    setSaving(true)
    const attempt = saveRef
      .current(snapshot)
      .then(() => {
        savedRef.current = snapshot
        setSavedValue(snapshot)
        setFailed(false)
        retryDelayRef.current = RETRY_FIRST_MS
        return true
      })
      .catch(() => {
        setFailed(true)
        // keep trying in the background; typing or coming back online tries sooner
        timerRef.current = setTimeout(() => run(), retryDelayRef.current)
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, RETRY_MAX_MS)
        return false
      })
      .finally(() => {
        inFlightRef.current = null
        setSaving(false)
      })
    inFlightRef.current = attempt
    return attempt.then((ok) => (ok && isDirty() ? run() : ok))
  }, [])

  // debounce: each change restarts the wait
  useEffect(() => {
    if (isEqual(value, savedRef.current)) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(), delay)
  }, [value, delay, isEqual, flush])

  useEffect(() => {
    // saves as soon as the connection is back
    const onOnline = () => {
      if (isDirty()) flush()
    }
    // the tab being hidden is often the last chance before it's closed or frozen
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && isDirty()) flush()
    }
    // warns before leaving the page with unsaved changes
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty() || inFlightRef.current) e.preventDefault()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  // leaving the editor saves what's left, after any save already running (so a new note isn't created twice)
  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      const pending = inFlightRef.current ?? Promise.resolve(true)
      void pending.then(() => {
        if (isDirty()) return saveRef.current(latestRef.current).catch(() => {})
      })
    },
    [],
  )

  let status: AutosaveStatus = 'saved'
  if (failed) status = 'error'
  else if (saving) status = 'saving'
  else if (!isEqual(value, savedValue)) status = 'unsaved'

  return { status, flush }
}

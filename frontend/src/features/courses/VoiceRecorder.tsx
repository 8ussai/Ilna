import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MAX_UPLOAD_BYTES } from '../../api/courses'
import { formatDateTime, formatDuration } from '../../lib/dates'
import { primaryButtonInline, secondaryButtonInline } from '../../components/styles'

// in order of preference; iOS Safari only records audio/mp4, the others webm or ogg
const RECORDING_TYPES: [mime: string, extension: string][] = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
]

// milliseconds on a monotonic clock, for the recording timer (only read from event handlers and timers)
// a recording this big stops and saves itself, leaving room under the upload limit (hours of audio in practice)
const RECORDING_STOP_BYTES = MAX_UPLOAD_BYTES - 2 * 1024 ** 2

function clock() {
  return performance.now()
}

function pickRecordingType() {
  if (typeof MediaRecorder === 'undefined') return null
  return RECORDING_TYPES.find(([mime]) => MediaRecorder.isTypeSupported(mime)) ?? null
}

type Phase = 'idle' | 'starting' | 'recording' | 'paused'
type Problem = 'unsupported' | 'denied' | 'noMic' | 'failed' | null

type VoiceRecorderProps = {
  // the recording as a file to upload, with its length (MediaRecorder files often don't store one)
  onRecorded: (file: File, durationSec: number) => void
  onCancel: () => void
}

export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const { t, i18n } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [problem, setProblem] = useState<Problem>(() => (pickRecordingType() && navigator.mediaDevices ? null : 'unsupported'))
  const [elapsedMs, setElapsedMs] = useState(0)
  // announced to screen readers on start/pause/stop; the timer itself isn't read every second
  const [announcement, setAnnouncement] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const levelRef = useRef<HTMLDivElement>(null)
  // time recorded before the current stretch, and when the current stretch started
  const clockRef = useRef({ before: 0, since: 0 })
  const discardRef = useRef(false)

  const active = phase === 'recording' || phase === 'paused'

  function release() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
  }

  // stop the microphone if the recorder goes away mid-recording
  useEffect(() => {
    return () => {
      discardRef.current = true
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
      release()
    }
  }, [])

  // leaving the page would lose the recording
  useEffect(() => {
    if (!active) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])

  useEffect(() => {
    if (phase !== 'recording') return
    const timer = setInterval(() => {
      const { before, since } = clockRef.current
      setElapsedMs(before + (clock() - since))
    }, 250)
    return () => clearInterval(timer)
  }, [phase])

  async function start() {
    const type = pickRecordingType()
    if (!type) {
      setProblem('unsupported')
      return
    }
    setProblem(null)
    setPhase('starting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'noMic' : 'failed')
      setPhase('idle')
      return
    }
    streamRef.current = stream
    startLevelMeter(stream)

    const [mime, extension] = type
    const recorder = new MediaRecorder(stream, { mimeType: mime })
    chunksRef.current = []
    discardRef.current = false
    let recordedBytes = 0
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
      recordedBytes += e.data.size
      if (recordedBytes >= RECORDING_STOP_BYTES && recorder.state !== 'inactive') {
        stop(true)
        setAnnouncement(t('courses.voice.sizeLimit'))
      }
    }
    recorder.onstop = () => {
      release()
      if (discardRef.current) return
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] })
      const name = `${t('courses.voice.recordingName', { date: formatDateTime(new Date(), i18n.language) })}.${extension}`
      onRecorded(new File([blob], name, { type: blob.type }), clockRef.current.before / 1000)
    }
    recorderRef.current = recorder
    // collected in one-second pieces rather than held as a single growing buffer until stop
    recorder.start(1000)
    clockRef.current = { before: 0, since: clock() }
    setElapsedMs(0)
    setPhase('recording')
    setAnnouncement(t('courses.voice.started'))
  }

  function startLevelMeter(stream: MediaStream) {
    try {
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      audioContextRef.current = context
      const samples = new Uint8Array(analyser.fftSize)
      const draw = () => {
        if (audioContextRef.current !== context) return
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2
        // loudness, scaled so normal speech fills most of the bar
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4)
        if (levelRef.current) levelRef.current.style.transform = `scaleX(${level})`
        requestAnimationFrame(draw)
      }
      draw()
    } catch {
      // the meter is a nicety; recording works without it
    }
  }

  function pause() {
    recorderRef.current?.pause()
    const { before, since } = clockRef.current
    clockRef.current = { before: before + (clock() - since), since: 0 }
    setElapsedMs(clockRef.current.before)
    setPhase('paused')
    setAnnouncement(t('courses.voice.pausedNote'))
  }

  function resume() {
    recorderRef.current?.resume()
    clockRef.current = { ...clockRef.current, since: clock() }
    setPhase('recording')
    setAnnouncement(t('courses.voice.resumed'))
  }

  // also called from the recorder's data handler, which holds the start-time render, so the phase is read off the recorder
  function stop(keep: boolean) {
    if (recorderRef.current?.state === 'recording') {
      const { before, since } = clockRef.current
      clockRef.current = { before: before + (clock() - since), since: 0 }
    }
    discardRef.current = !keep
    recorderRef.current?.stop()
    setPhase('idle')
    setAnnouncement(keep ? t('courses.voice.stopped') : t('courses.voice.discarded'))
    if (!keep) onCancel()
  }

  return (
    <section aria-labelledby="recorder-title" className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 id="recorder-title" className="font-semibold">
        {t('courses.voice.recorderTitle')}
      </h3>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {problem && (
        <p role="alert" className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-danger">
          {t(`courses.voice.problem.${problem}`)}
        </p>
      )}

      {active ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`size-3 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-danger' : 'bg-muted'}`}
            />
            <span role="timer" aria-live="off" dir="ltr" className="font-mono text-2xl tabular-nums">
              {formatDuration(elapsedMs / 1000)}
            </span>
            <span className="text-sm text-muted">{phase === 'paused' ? t('courses.voice.paused') : t('courses.voice.recording')}</span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              ref={levelRef}
              className={`h-full origin-left rounded-full transition-transform duration-75 rtl:origin-right ${phase === 'paused' ? 'bg-muted' : 'bg-accent'}`}
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {phase === 'recording' ? (
              <button type="button" onClick={pause} className={secondaryButtonInline}>
                {t('courses.voice.pause')}
              </button>
            ) : (
              <button type="button" onClick={resume} className={secondaryButtonInline}>
                {t('courses.voice.resume')}
              </button>
            )}
            <button type="button" onClick={() => stop(true)} className={primaryButtonInline}>
              {t('courses.voice.stop')}
            </button>
            <button type="button" onClick={() => stop(false)} className="h-11 rounded-lg px-4 text-sm text-muted hover:bg-surface hover:text-danger">
              {t('courses.voice.discard')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{t('courses.voice.recorderHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={start}
              disabled={phase === 'starting' || problem === 'unsupported'}
              className={`${primaryButtonInline} inline-flex items-center gap-2`}
            >
              <span aria-hidden="true" className="size-2.5 rounded-full bg-current" />
              {phase === 'starting' ? t('courses.voice.starting') : t('courses.voice.start')}
            </button>
            <button type="button" onClick={onCancel} className={secondaryButtonInline}>
              {t('feed.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

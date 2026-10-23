import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useTranslation } from 'react-i18next'

// matches CONTACT_EMAIL in backend/config.py
export const SUPPORT_EMAIL = 'support@ilna-academic.com'

const features = [
  // a folder: courses holding files, links and notes
  { key: 'workspace', path: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' },
  // a microphone: lectures recorded and transcribed
  { key: 'voice', path: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3' },
  // a spark: AI summaries and quizzes
  { key: 'quiz', path: 'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3ZM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z' },
  // two arrows: courses shared between students
  { key: 'share', path: 'M17 3l4 4-4 4M21 7H9a4 4 0 0 0-4 4M7 21l-4-4 4-4M3 17h12a4 4 0 0 0 4-4' },
  // lines of posts: the campus blogs
  { key: 'feed', path: 'M4 5h16v11H9l-5 4V5ZM8 9h8M8 12h5' },
  // people: friends
  { key: 'friends', path: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6' },
] as const

const SLIDE_MS = 5000
// the most a drag needs to travel to move to the next card
const SWIPE_PX = 60

// True while the media query matches, updating when it changes.
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// The feature cards, one at a time, sliding every few seconds. The card can be
// grabbed and dragged (mouse or finger) to the next or previous one; dots jump.
function FeatureCarousel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const reduceMotion = useMedia('(prefers-reduced-motion: reduce)')
  const steps = features.length
  const [current, setCurrent] = useState(0)
  const [hovered, setHovered] = useState(false)
  // how far the card is dragged, in px; null when not dragging
  const [drag, setDrag] = useState<number | null>(null)
  const startX = useRef<number | null>(null)

  const go = (i: number) => setCurrent(((i % steps) + steps) % steps)

  useEffect(() => {
    if (hovered || drag !== null || reduceMotion) return
    const id = setInterval(() => setCurrent((i) => (i + 1) % steps), SLIDE_MS)
    return () => clearInterval(id)
  }, [hovered, drag, reduceMotion, steps])

  // a drag toward the start side (left, or right in Arabic) moves forward
  const isForward = (dx: number) => (rtl ? dx > 0 : dx < 0)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startX.current = e.clientX
    setDrag(0)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return
    let dx = e.clientX - startX.current
    // drag past the first or last card feels heavy
    const pastEdge = isForward(dx) ? current === steps - 1 : current === 0
    if (pastEdge) dx /= 3
    setDrag(dx)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    setDrag(null)
    const threshold = Math.min(SWIPE_PX, e.currentTarget.offsetWidth * 0.2)
    if (commit && Math.abs(dx) >= threshold) go(current + (isForward(dx) ? 1 : -1))
  }

  // in Arabic the track runs right to left, so it moves the other way
  const base = `${rtl ? '' : '-'}${current * 100}%`

  return (
    <div
      className="mt-8"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div
        className={`-mx-2 touch-pan-y overflow-hidden select-none ${drag !== null ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
      >
        <ul
          className={`flex ${drag !== null ? '' : 'transition-transform duration-500 ease-out motion-reduce:transition-none'}`}
          style={{ transform: `translateX(calc(${base} + ${drag ?? 0}px))` }}
        >
          {features.map((f, i) => (
            <li key={f.key} className="shrink-0 basis-full px-2" aria-hidden={i !== current}>
              <div className="flex h-full gap-4 rounded-xl bg-surface p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-bg text-accent">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={f.path} />
                  </svg>
                </span>
                <div>
                  <h2 className="font-medium">{t(`intro.${f.key}Title`)}</h2>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{t(`intro.${f.key}Body`)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {features.map((f, i) => (
          <button
            key={f.key}
            type="button"
            onClick={() => go(i)}
            aria-label={t(`intro.${f.key}Title`)}
            aria-current={i === current}
            className={`h-2 rounded-full transition-all ${i === current ? 'w-6 bg-accent' : 'w-2 bg-muted/40 hover:bg-muted'}`}
          />
        ))}
      </div>
    </div>
  )
}

// What Ilna is, beside the sign-in card on the landing page.
export function Intro() {
  const { t } = useTranslation()

  return (
    <section>
      <h1 className="font-serif text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
        {t('intro.title')}
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t('intro.body')}</p>

      <FeatureCarousel />

      <IntroNote className="mt-8 hidden lg:block" />
    </section>
  )
}

// "Ilna is free … email us". Beside the intro on desktop; Landing shows it
// under the sign-in card on phones instead.
export function IntroNote({ className = '' }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <p className={`text-sm text-muted ${className}`}>
      {t('intro.free')}{' '}
      {t('intro.support')}{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-medium text-accent hover:underline">
        {SUPPORT_EMAIL}
      </a>
    </p>
  )
}

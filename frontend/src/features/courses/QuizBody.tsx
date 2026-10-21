import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { fetchQuizAttempts, submitQuizAttempt } from '../../api/study'
import type { QuizAttempt, QuizPublic, StudyItemSummary, StudyLanguage } from '../../api/study'
import { formatDateTime, parseServerDate } from '../../lib/dates'
import { primaryButtonInline, secondaryButtonInline } from '../../components/styles'
import { MixedText } from './MixedText'

// option labels in the quiz's own script
const LETTERS: Record<StudyLanguage, string[]> = { en: ['A', 'B', 'C', 'D'], ar: ['أ', 'ب', 'ج', 'د'] }

type Answers = (number | null)[]

// answers in progress survive a reload or a wander to another tab, on this device only
const draftKey = (itemId: number) => `ilna-quiz-draft-${itemId}`

// answers picked so far in this quiz, kept in the browser
function loadDraft(itemId: number, total: number): Answers {
  const empty: Answers = Array(total).fill(null)
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(itemId)) ?? 'null')
    return Array.isArray(saved) && saved.length === total ? saved : empty
  } catch {
    return empty
  }
}

// keeps the picked answers in the browser, or clears them
function saveDraft(itemId: number, answers: Answers | null) {
  try {
    if (answers && answers.some((a) => a !== null)) localStorage.setItem(draftKey(itemId), JSON.stringify(answers))
    else localStorage.removeItem(draftKey(itemId))
  } catch {
    // storage may be blocked; the answers just won't outlive the page
  }
}

type Mode = { kind: 'loading' } | { kind: 'error' } | { kind: 'taking' } | { kind: 'review'; attempt: QuizAttempt }

type QuizBodyProps = {
  courseId: number
  item: StudyItemSummary
  content: QuizPublic
  language: StudyLanguage
  onAttempted: (attempt: QuizAttempt) => void
}

// A quiz: answered here, marked by the server, then reviewed with the right answers and explanations.
// Opening one that's been taken shows its latest result; Retake starts a fresh attempt.
export function QuizBody({ courseId, item, content, language, onAttempted }: QuizBodyProps) {
  const { i18n } = useTranslation()
  // everything inside the quiz reads in its language, not the page's
  const t = i18n.getFixedT(language)
  const total = content.questions.length
  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [answers, setAnswers] = useState<Answers>(() => loadDraft(item.id, total))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadKey, setLoadKey] = useState(0)
  // where focus goes after the view changes: the mark after submitting, the first question after Retake
  const focusNext = useRef<'mark' | 'intro' | null>(null)
  const markRef = useRef<HTMLHeadingElement>(null)
  const introRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let ignore = false
    fetchQuizAttempts(courseId, item.id)
      .then((list) => {
        if (ignore) return
        setAttempts(list)
        // a quiz in progress carries on; otherwise show how it went last time
        const inProgress = loadDraft(item.id, total).some((a) => a !== null)
        setMode(list.length > 0 && !inProgress ? { kind: 'review', attempt: list[0] } : { kind: 'taking' })
      })
      .catch(() => {
        if (!ignore) setMode({ kind: 'error' })
      })
    return () => {
      ignore = true
    }
  }, [courseId, item.id, total, loadKey])

  useEffect(() => {
    if (focusNext.current === null) return
    ;(focusNext.current === 'mark' ? markRef : introRef).current?.focus()
    focusNext.current = null
  })

  // picks an option for a question
  function answer(question: number, option: number) {
    const next = answers.map((a, i) => (i === question ? option : a))
    setAnswers(next)
    setConfirming(false)
    saveDraft(item.id, next)
  }

  // sends the answers to be graded
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (answers.some((a) => a === null) && !confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const attempt = await submitQuizAttempt(courseId, item.id, answers)
      saveDraft(item.id, null)
      setAttempts((current) => [attempt, ...current])
      setMode({ kind: 'review', attempt })
      focusNext.current = 'mark'
      setConfirming(false)
      onAttempted(attempt)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('courses.study.quiz.submitFailed'))
    } finally {
      setBusy(false)
    }
  }

  // starts the quiz again
  function retake() {
    const fresh: Answers = Array(total).fill(null)
    setAnswers(fresh)
    saveDraft(item.id, null)
    setConfirming(false)
    setError('')
    setMode({ kind: 'taking' })
    focusNext.current = 'intro'
  }

  const dir = language === 'ar' ? 'rtl' : 'ltr'

  if (mode.kind === 'loading') {
    return (
      <p className="py-10 text-center text-muted" role="status">
        {t('feed.loading')}
      </p>
    )
  }
  if (mode.kind === 'error') {
    return (
      <div lang={language} dir={dir} className="py-10 text-center">
        <p className="text-muted">{t('courses.study.quiz.loadFailed')}</p>
        <button type="button" onClick={() => setLoadKey((k) => k + 1)} className={`${secondaryButtonInline} mt-4`}>
          {t('auth.retry')}
        </button>
      </div>
    )
  }

  if (mode.kind === 'review') {
    return (
      <Review
        attempt={mode.attempt}
        attempts={attempts}
        content={content}
        language={language}
        onPick={(attempt) => {
          setMode({ kind: 'review', attempt })
          focusNext.current = 'mark'
        }}
        onRetake={retake}
        markRef={markRef}
      />
    )
  }

  const answered = answers.filter((a) => a !== null).length
  const unanswered = total - answered

  return (
    <form onSubmit={submit} lang={language} dir={dir} className="space-y-6">
      <p ref={introRef} tabIndex={-1} className="text-muted focus:outline-none">
        {t('courses.study.quiz.intro')}
      </p>

      <ol className="space-y-5">
        {content.questions.map((question, i) => (
          <li key={i}>
            <fieldset className="rounded-2xl border border-line bg-card p-4 sm:p-5">
              <legend className="contents">
                <span className="block text-xs font-semibold text-muted">{t('courses.study.quiz.questionOf', { n: i + 1, total })}</span>
                <span className="mt-1 block text-lg font-medium">
                  <MixedText text={question.question} />
                </span>
              </legend>
              <div className="mt-4 space-y-2">
                {question.options.map((option, j) => {
                  const checked = answers[i] === j
                  return (
                    <label
                      key={j}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                        checked ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface'
                      }`}
                    >
                      <input type="radio" name={`quiz-${item.id}-${i}`} checked={checked} onChange={() => answer(i, j)} className="sr-only" />
                      <Letter active={checked}>{LETTERS[language][j]}</Letter>
                      <span className="pt-0.5">
                        <MixedText text={option} />
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="space-y-3 rounded-2xl border border-line bg-surface/60 p-4">
        <p className="text-sm text-muted" aria-live="polite">
          {t('courses.study.quiz.answered', { count: answered, total })}
        </p>
        {confirming && unanswered > 0 && (
          <p role="alert" className="text-sm">
            {t('courses.study.quiz.unanswered', { count: unanswered })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryButtonInline}>
            {busy ? t('courses.study.quiz.submitting') : confirming && unanswered > 0 ? t('courses.study.quiz.submitAnyway') : t('courses.study.quiz.submit')}
          </button>
          {confirming && unanswered > 0 && (
            <button type="button" onClick={() => setConfirming(false)} className={secondaryButtonInline}>
              {t('courses.study.quiz.keepGoing')}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

// a graded attempt: each question with the right answer and its explanation
function Review({
  attempt,
  attempts,
  content,
  language,
  onPick,
  onRetake,
  markRef,
}: {
  attempt: QuizAttempt
  attempts: QuizAttempt[]
  content: QuizPublic
  language: StudyLanguage
  onPick: (attempt: QuizAttempt) => void
  onRetake: () => void
  markRef: RefObject<HTMLHeadingElement | null>
}) {
  const { i18n } = useTranslation()
  const t = i18n.getFixedT(language)
  const [onlyMistakes, setOnlyMistakes] = useState(false)
  const percent = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0
  const verdict = percent >= 80 ? 'high' : percent >= 50 ? 'mid' : 'low'
  const mistakes = attempt.results.filter((r) => !r.is_correct).length
  const latest = attempts[0]?.id === attempt.id
  // Latin digits throughout, like the scores on the cards
  const number = new Intl.NumberFormat(language === 'ar' ? 'ar-u-nu-latn' : 'en', { style: 'percent' })

  return (
    <div lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <section aria-labelledby={`mark-${attempt.id}`} className="rounded-2xl border border-line bg-card p-5">
        <h2 id={`mark-${attempt.id}`} ref={markRef} tabIndex={-1} className="text-sm font-semibold text-muted focus:outline-none">
          {latest ? t('courses.study.quiz.mark') : t('courses.study.quiz.pastMark', { date: formatDateTime(parseServerDate(attempt.created_at), language) })}
        </h2>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span dir="ltr" className="font-serif text-5xl font-semibold tabular-nums">
            {attempt.score}/{attempt.total}
          </span>
          <span className="text-xl text-muted tabular-nums">{number.format(percent / 100)}</span>
        </p>
        <p className="mt-2">{t(`courses.study.quiz.verdict.${verdict}`)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onRetake} className={primaryButtonInline}>
            {t('courses.study.quiz.retake')}
          </button>
          {mistakes > 0 && mistakes < attempt.total && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyMistakes} onChange={(e) => setOnlyMistakes(e.target.checked)} className="size-4 accent-accent" />
              {t('courses.study.quiz.onlyMistakes')}
            </label>
          )}
        </div>
      </section>

      <ol className="space-y-5">
        {content.questions.map((question, i) => {
          const result = attempt.results[i]
          if (!result || (onlyMistakes && result.is_correct)) return null
          const explanation = result.explanation[language] ?? Object.values(result.explanation)[0]
          return (
            <li key={i} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-muted">{t('courses.study.quiz.questionOf', { n: i + 1, total: attempt.total })}</span>
                <span className={result.is_correct ? 'text-success' : 'text-danger'}>
                  {result.is_correct ? t('courses.study.quiz.correct') : result.chosen === null ? t('courses.study.quiz.notAnswered') : t('courses.study.quiz.wrong')}
                </span>
              </p>
              <p className="mt-1 text-lg font-medium">
                <MixedText text={question.question} />
              </p>
              <ul className="mt-4 space-y-2">
                {question.options.map((option, j) => {
                  const isCorrect = j === result.correct_index
                  const isChosen = j === result.chosen
                  return (
                    <li
                      key={j}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                        isCorrect ? 'border-success bg-success/10' : isChosen ? 'border-danger bg-danger/10' : 'border-line'
                      }`}
                    >
                      <Letter active={isCorrect || isChosen} tone={isCorrect ? 'success' : isChosen ? 'danger' : undefined}>
                        {LETTERS[language][j]}
                      </Letter>
                      <span className="flex-1 pt-0.5">
                        <MixedText text={option} />
                      </span>
                      {(isCorrect || isChosen) && (
                        <span className={`shrink-0 pt-0.5 text-xs font-semibold ${isCorrect ? 'text-success' : 'text-danger'}`}>
                          {isChosen ? t('courses.study.quiz.yourAnswer') : t('courses.study.quiz.correctAnswer')}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
              {explanation && (
                <p className="mt-3 rounded-xl bg-surface px-3 py-2.5 text-sm">
                  <span className="font-semibold">{t('courses.study.quiz.why')} </span>
                  <MixedText text={explanation} />
                </p>
              )}
            </li>
          )
        })}
      </ol>

      {attempts.length > 1 && (
        <section aria-labelledby={`attempts-${attempt.id}`} className="space-y-2">
          <h2 id={`attempts-${attempt.id}`} className="font-serif text-xl font-semibold">
            {t('courses.study.quiz.attempts')}
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {attempts.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onPick(a)}
                  aria-current={a.id === attempt.id ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface ${a.id === attempt.id ? 'bg-surface font-medium' : ''}`}
                >
                  <span>
                    {formatDateTime(parseServerDate(a.created_at), language)}
                    {i === 0 && <span className="ms-2 text-xs text-muted">{t('courses.study.quiz.latest')}</span>}
                  </span>
                  <span dir="ltr" className="tabular-nums">
                    {a.score}/{a.total}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// the A, B, C, D badge of an option
function Letter({ active, tone, children }: { active: boolean; tone?: 'success' | 'danger'; children: string }) {
  const color = tone === 'success' ? 'bg-success text-accent-fg' : tone === 'danger' ? 'bg-danger text-accent-fg' : active ? 'bg-accent text-accent-fg' : 'bg-surface text-muted'
  return (
    <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${color}`}>
      {children}
    </span>
  )
}

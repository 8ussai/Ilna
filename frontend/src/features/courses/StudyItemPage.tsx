import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import {
  deleteStudyItem,
  fetchStudyItem,
  LANGUAGE_NAMES,
  retryStudyItem,
  STUDY_LANGUAGES,
  studyLanguage,
  updateStudyItem,
} from '../../api/study'
import type { StudyItem, StudyItemSummary, StudyKind, StudyLanguage, StudySource, SummaryContent } from '../../api/study'
import { formatDate, parseServerDate } from '../../lib/dates'
import { inAppClick } from '../../lib/links'
import { coursePath, STUDY_SECTIONS } from '../../lib/tabs'
import { DeleteButton } from '../../components/DeleteButton'
import { useCourseCanEdit } from './courseAccess'
import { secondaryButtonInline } from '../../components/styles'
import { InlineRename } from './InlineRename'
import { MixedText } from './MixedText'
import { QuizBody } from './QuizBody'

type StudyItemPageProps = {
  courseId: number
  // the card's copy, kept fresh by the course page's polling
  item: StudyItemSummary
  onChanged: (item: StudyItemSummary) => void
  onDeleted: () => void
  onBack: () => void
}

type Status = 'loading' | 'ready' | 'error' | 'gone'

// One summary or quiz on its own page. It reads in its own language, chosen here and
// remembered for it, whatever language the rest of the site is in.
export function StudyItemPage({ courseId, item, onChanged, onDeleted, onBack }: StudyItemPageProps) {
  const { t, i18n } = useTranslation()
  const [full, setFull] = useState<StudyItem | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  // chosen here; until then, the one it was last read in
  const [picked, setPicked] = useState<StudyLanguage | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const canEdit = useCourseCanEdit()
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  // fetched again when a version is added (the translation finishing, or a retry)
  const versions = `${item.status}/${item.translation_status}`
  useEffect(() => {
    let ignore = false
    fetchStudyItem(courseId, item.id)
      .then((result) => {
        if (ignore) return
        setFull(result)
        setStatus('ready')
      })
      .catch((err) => {
        if (!ignore) setStatus(err instanceof ApiError && err.status === 404 ? 'gone' : 'error')
      })
    return () => {
      ignore = true
    }
  }, [courseId, item.id, versions, attempt])

  // move to the page, which replaces the list, once it has loaded
  const loaded = status === 'ready'
  useEffect(() => {
    if (loaded) headingRef.current?.focus()
  }, [item.id, loaded])

  const content = (full?.summary ?? full?.quiz ?? {}) as Partial<Record<StudyLanguage, { title: string }>>
  // whether this language's version is ready
  const isReady = (language: StudyLanguage | null): language is StudyLanguage => language !== null && content[language] !== undefined
  const language = [picked, studyLanguage(item), item.main_language].find(isReady) ?? null
  const title = item.title ?? (language ? content[language]?.title : undefined) ?? t(`courses.study.newTitle.${item.kind}`)

  // switches the reading language (remembered for the owner)
  function choose(next: StudyLanguage) {
    setPicked(next)
    // the owner's choice is remembered for next time; someone who added the course just switches
    if (!canEdit) return
    updateStudyItem(courseId, item.id, { view_language: next })
      .then(onChanged)
      .catch(() => {})
  }

  // tries the translation again
  async function retryTranslation() {
    setRetrying(true)
    setError('')
    try {
      onChanged(await retryStudyItem(courseId, item.id))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    } finally {
      setRetrying(false)
    }
  }

  // deletes the summary or quiz
  async function remove() {
    try {
      await deleteStudyItem(courseId, item.id)
    } catch (err) {
      // already gone counts as deleted
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(t('errors.generic'))
        return
      }
    }
    onDeleted()
  }

  const back = (
    <a
      href={coursePath(courseId, STUDY_SECTIONS[item.kind])}
      onClick={inAppClick(onBack)}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
    >
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {t(`courses.study.reader.back.${item.kind}`)}
    </a>
  )

  if (status !== 'ready' || !full || !language) {
    return (
      <div className="space-y-4">
        {back}
        {status === 'loading' ? (
          <p className="py-10 text-center text-muted" role="status">
            {t('feed.loading')}
          </p>
        ) : (
          <div className="py-10 text-center">
            <p className="text-muted">{status === 'gone' ? t('courses.study.reader.gone') : t('courses.study.reader.loadFailed')}</p>
            {status === 'error' && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${secondaryButtonInline} mt-4`}>
                {t('auth.retry')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        {canEdit && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setRenaming(true)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
              {t('courses.menu.rename')}
            </button>
            <DeleteButton question={t(`courses.study.confirmDelete.${item.kind}`)} onConfirm={remove} />
          </div>
        )}
      </div>

      <header className="space-y-3">
        <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <KindIcon kind={item.kind} />
          {t(`courses.study.kind.${item.kind}`)}
          <span className="font-normal tracking-normal normal-case">
            ·{' '}
            {item.kind === 'quiz'
              ? t('courses.study.questions', { count: item.question_count ?? 0 })
              : t(`courses.study.length.${item.options.length ?? 'brief'}`)}{' '}
            · {formatDate(parseServerDate(item.created_at), i18n.language)}
          </span>
        </p>

        {renaming ? (
          <InlineRename
            value={title}
            label={t('courses.study.reader.renameLabel')}
            maxLength={200}
            onSave={async (name) => onChanged(await updateStudyItem(courseId, item.id, { title: name }))}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <h1
            ref={headingRef}
            tabIndex={-1}
            dir="auto"
            lang={item.title ? undefined : language}
            className="scroll-mt-32 font-serif text-3xl leading-tight font-semibold break-words focus:outline-none"
          >
            {title}
          </h1>
        )}

        <Sources sources={item.sources} />

        <div className="flex flex-wrap items-center gap-3">
          <LanguageSwitch item={item} ready={(l) => isReady(l)} value={language} onChange={choose} />
          {item.translation_status === 'failed' && (
            <span className="text-sm">
              <span className="text-danger">
                {t('courses.study.translationFailed', { language: LANGUAGE_NAMES[language === 'ar' ? 'en' : 'ar'] })}
              </span>{' '}
              {canEdit && (
                <button type="button" onClick={retryTranslation} disabled={retrying} className="font-medium underline disabled:opacity-50">
                  {retrying ? t('courses.study.retrying') : t('courses.study.retry')}
                </button>
              )}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </header>

      <div className="border-t border-line pt-6">
        {full.summary?.[language] && <SummaryBody itemId={item.id} content={full.summary[language]} language={language} />}
        {full.quiz?.[language] && (
          <QuizBody
            courseId={courseId}
            item={item}
            content={full.quiz[language]}
            language={language}
            onAttempted={(attempt) =>
              // the card's scores, without fetching the list again
              onChanged({
                ...item,
                attempts_count: item.attempts_count + 1,
                last_score: attempt.score,
                best_score: Math.max(item.best_score ?? 0, attempt.score),
              })
            }
          />
        )}
      </div>
    </div>
  )
}

// The two languages as a pair of radio buttons; one that isn't ready yet says so and can't be picked.
function LanguageSwitch({
  item,
  ready,
  value,
  onChange,
}: {
  item: StudyItemSummary
  ready: (language: StudyLanguage) => boolean
  value: StudyLanguage
  onChange: (language: StudyLanguage) => void
}) {
  const { t } = useTranslation()
  const preparing = item.translation_status === 'pending' || item.translation_status === 'processing'

  return (
    <div role="radiogroup" aria-label={t('courses.study.reader.language')} className="inline-flex rounded-xl border border-line p-1">
      {STUDY_LANGUAGES.map((language) => {
        const available = ready(language)
        return (
          <label
            key={language}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-accent ${
              value === language ? 'bg-accent text-accent-fg' : available ? 'cursor-pointer hover:bg-surface' : 'cursor-not-allowed text-muted'
            }`}
          >
            <input
              type="radio"
              name={`study-language-${item.id}`}
              checked={value === language}
              disabled={!available}
              onChange={() => onChange(language)}
              className="sr-only"
            />
            <span lang={language}>{LANGUAGE_NAMES[language]}</span>
            {!available && preparing && (
              <span className="inline-flex items-center gap-1 text-xs font-normal">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-muted" />
                {t('courses.study.reader.preparing')}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

// the files, recordings and notes it was made from
function Sources({ sources }: { sources: StudySource[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted">{t('courses.study.reader.madeFrom')}</span>
      <ul className="contents">
        {sources.map((source) => (
          <li key={`${source.type}-${source.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5">
            <SourceIcon kind={source.kind} />
            <span className="sr-only">{t(`courses.study.reader.sourceKind.${source.kind}`)}:</span>
            <span dir="auto" className="truncate">
              {source.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// a source's icon
function SourceIcon({ kind }: { kind: StudySource['kind'] }) {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'document' && <path d="M6 3h9l4 4v14H6zM14 3v5h5" />}
      {kind === 'audio' && <path d="M9 3h6v11a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" />}
      {kind === 'text' && <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" />}
    </svg>
  )
}

// a long summary gets a list of its sections at the top
const CONTENTS_FROM_SECTIONS = 4

// a summary: overview, sections with their points, and key terms
function SummaryBody({ itemId, content, language }: { itemId: number; content: SummaryContent; language: StudyLanguage }) {
  const { i18n } = useTranslation()
  // its own headings are in its language, not the page's
  const t = i18n.getFixedT(language)
  // a section's id, for the contents links at the top
  const sectionId = (i: number) => `summary-${itemId}-section-${i}`

  return (
    <article lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-8 leading-relaxed">
      <p className="text-lg">
        <MixedText text={content.overview} />
      </p>

      {content.sections.length >= CONTENTS_FROM_SECTIONS && (
        <nav aria-label={t('courses.study.reader.contents')} className="rounded-xl bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('courses.study.reader.contents')}</h2>
          <ol className="list-decimal space-y-1 ps-5 marker:text-muted">
            {content.sections.map((section, i) => (
              <li key={i}>
                {/* not a #link: the hash is the page's own address */}
                <button
                  type="button"
                  onClick={() => document.getElementById(sectionId(i))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="text-start hover:underline"
                >
                  <MixedText text={section.heading} />
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {content.sections.map((section, i) => (
        <Section key={i} id={sectionId(i)} heading={<MixedText text={section.heading} />}>
          <ul className="list-disc space-y-2 ps-5 marker:text-accent">
            {section.points.map((point, j) => (
              <li key={j}>
                <MixedText text={point} />
              </li>
            ))}
          </ul>
        </Section>
      ))}

      {content.key_terms.length > 0 && (
        <Section id={`summary-${itemId}-terms`} heading={t('courses.study.reader.keyTerms')}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {content.key_terms.map((term, i) => (
              <div key={i} className="rounded-xl border border-line bg-card p-4">
                <dt className="font-semibold">
                  <MixedText text={term.term} />
                </dt>
                <dd className="mt-1 text-sm text-muted">
                  <MixedText text={term.definition} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </article>
  )
}

// one titled part of the summary
function Section({ id, heading, children }: { id: string; heading: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} id={id} className="scroll-mt-32 space-y-3">
      <h2 id={`${id}-heading`} className="font-serif text-xl font-semibold">
        {heading}
      </h2>
      {children}
    </section>
  )
}

// the summary or quiz icon
export function KindIcon({ kind }: { kind: StudyKind }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'summary' ? (
        <path d="M4 6h16M4 10h16M4 14h10M4 18h7" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" />
        </>
      )}
    </svg>
  )
}

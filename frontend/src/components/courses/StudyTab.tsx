import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { deleteStudyItem, isStudyItemWorking, LANGUAGE_NAMES, retryStudyItem, studyLanguage } from '../../api/study'
import type { StudyItemSummary, StudyKind, StudyLanguage } from '../../api/study'
import { formatRelative, parseServerDate } from '../../dates'
import { DeleteButton } from '../DeleteButton'

// sources named on a card before the rest are counted
const SOURCES_SHOWN = 2

type Filter = 'all' | StudyKind

type StudyTabProps = {
  courseId: number
  // newest first
  items: StudyItemSummary[]
  onChanged: (item: StudyItemSummary) => void
  onDeleted: (itemId: number) => void
}

export function StudyTab({ courseId, items, onChanged, onDeleted }: StudyTabProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const counts = { all: items.length, summary: items.filter((i) => i.kind === 'summary').length, quiz: items.filter((i) => i.kind === 'quiz').length }
  // the filter only means something once there are both
  const showFilter = counts.summary > 0 && counts.quiz > 0
  const shown = showFilter && filter !== 'all' ? items.filter((i) => i.kind === filter) : items

  if (items.length === 0) {
    return <p className="py-8 text-center text-muted">{t('courses.study.empty')}</p>
  }

  return (
    <div className="space-y-4">
      {showFilter && (
        <div role="radiogroup" aria-label={t('courses.study.filter')} className="flex flex-wrap gap-2">
          {(['all', 'summary', 'quiz'] as const).map((value) => (
            <label
              key={value}
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                filter === value ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:bg-surface'
              }`}
            >
              <input type="radio" name="study-filter" checked={filter === value} onChange={() => setFilter(value)} className="sr-only" />
              {t(`courses.study.filters.${value}`)}
              <span className="tabular-nums opacity-80">{counts[value]}</span>
            </label>
          ))}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((item) => (
          <StudyCard key={item.id} courseId={courseId} item={item} onChanged={onChanged} onDeleted={() => onDeleted(item.id)} />
        ))}
      </ul>
    </div>
  )
}

function StudyCard({
  courseId,
  item,
  onChanged,
  onDeleted,
}: {
  courseId: number
  item: StudyItemSummary
  onChanged: (item: StudyItemSummary) => void
  onDeleted: () => void
}) {
  const { t, i18n } = useTranslation()
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')

  // the card reads in the language this item is read in, not the site's
  const chosen = studyLanguage(item)
  const language = chosen && item.titles[chosen] ? chosen : item.main_language
  const generatedTitle = language ? item.titles[language] : undefined
  const title = item.title ?? generatedTitle ?? t(`courses.study.newTitle.${item.kind}`)
  const otherLanguage: StudyLanguage | null = item.main_language ? (item.main_language === 'ar' ? 'en' : 'ar') : null
  const writing = item.status === 'pending' || item.status === 'processing'

  async function retry() {
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

  async function remove() {
    setError('')
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

  const shownSources = item.sources.slice(0, SOURCES_SHOWN).map((s) => s.name)
  const moreSources = item.sources.length - shownSources.length

  return (
    <li className="flex min-w-0 flex-col rounded-2xl border border-line bg-card">
      <div className="flex-1 space-y-2 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <KindIcon kind={item.kind} />
          {t(`courses.study.kind.${item.kind}`)}
          {item.status === 'done' && (
            <span className="font-normal tracking-normal normal-case">
              ·{' '}
              {item.kind === 'quiz'
                ? t('courses.study.questions', { count: item.question_count ?? 0 })
                : t(`courses.study.length.${item.options.length ?? 'brief'}`)}
            </span>
          )}
        </p>

        <h3 dir="auto" lang={generatedTitle && !item.title ? (language ?? undefined) : undefined} className="font-serif text-lg leading-snug font-semibold break-words">
          {title}
        </h3>

        <p className="text-sm text-muted">
          <span>{t('courses.study.from')} </span>
          {shownSources.map((name, i) => (
            <span key={i}>
              {i > 0 && (i18n.dir() === 'rtl' ? '، ' : ', ')}
              <bdi>{name}</bdi>
            </span>
          ))}
          {moreSources > 0 && <span> {t('courses.study.more', { count: moreSources })}</span>}
          <span aria-hidden="true"> · </span>
          <span>{formatRelative(parseServerDate(item.created_at), i18n.language)}</span>
        </p>

        {writing && (
          <div>
            <StatusPill working>{t('courses.study.writing')}</StatusPill>
            <p className="mt-1.5 text-xs text-muted">{t('courses.study.writingHint')}</p>
          </div>
        )}

        {item.status === 'failed' && (
          <div className="space-y-1">
            <p className="text-sm text-danger">{t(`courses.study.failed.${item.kind}`)}</p>
            {item.error_code && <p className="text-xs text-muted">{t(`courses.study.errors.${item.error_code}`)}</p>}
          </div>
        )}

        {item.status === 'done' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="sr-only">{t('courses.study.languages')}:</span>
            {item.main_language && <StatusPill lang={item.main_language}>{LANGUAGE_NAMES[item.main_language]}</StatusPill>}
            {otherLanguage && item.translation_status === 'done' && <StatusPill lang={otherLanguage}>{LANGUAGE_NAMES[otherLanguage]}</StatusPill>}
            {otherLanguage && isStudyItemWorking(item) && (
              <StatusPill working>{t('courses.study.translating', { language: LANGUAGE_NAMES[otherLanguage] })}</StatusPill>
            )}
            {otherLanguage && item.translation_status === 'failed' && (
              <span className="text-xs text-danger">
                {t('courses.study.translationFailed', { language: LANGUAGE_NAMES[otherLanguage] })}
                {item.translation_error_code && ` ${t(`courses.study.errors.${item.translation_error_code}`)}`}
              </span>
            )}
          </div>
        )}

        {item.status === 'done' && item.kind === 'quiz' && (
          <p className="text-sm">
            {item.attempts_count === 0 ? (
              <span className="text-muted">{t('courses.study.notTaken')}</span>
            ) : (
              <span dir="auto">
                {t('courses.study.scores', { best: item.best_score, last: item.last_score, total: item.question_count })}
              </span>
            )}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1 px-2 pb-2">
        {(item.status === 'failed' || item.translation_status === 'failed') && (
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="rounded-md px-2 py-1 text-sm font-medium hover:bg-surface disabled:opacity-50"
          >
            {retrying ? t('courses.study.retrying') : t('courses.study.retry')}
          </button>
        )}
        <DeleteButton question={t(`courses.study.confirmDelete.${item.kind}`)} onConfirm={remove} />
      </div>
    </li>
  )
}

function StatusPill({ working = false, lang, children }: { working?: boolean; lang?: string; children: string }) {
  return (
    <span lang={lang} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
      {working && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-muted" />}
      {children}
    </span>
  )
}

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

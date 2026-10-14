import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import { deleteStudyItem, isStudyItemWorking, LANGUAGE_NAMES, retryStudyItem, studyLanguage } from '../../api/study'
import type { StudyItemSummary, StudyKind, StudyLanguage } from '../../api/study'
import { formatRelative, parseServerDate } from '../../dates'
import { inAppClick } from '../../links'
import { coursePath, STUDY_SECTIONS } from '../../tabs'
import { DeleteButton } from '../DeleteButton'
import { smallPrimaryButton } from '../styles'
import { KindIcon, StudyItemPage } from './StudyItemPage'

// sources named on a card before the rest are counted
const SOURCES_SHOWN = 2

type StudyTabProps = {
  courseId: number
  // the tab's kind; items are all of it, newest first
  kind: StudyKind
  items: StudyItemSummary[]
  // false until the list has arrived, so an opened link doesn't look like a deleted item meanwhile
  loaded: boolean
  // the one open on its own page (from the URL), if any
  openId: number | null
  onOpen: (itemId: number | null) => void
  onChanged: (item: StudyItemSummary) => void
  onDeleted: (itemId: number) => void
}

function canOpen(item: StudyItemSummary) {
  return item.status === 'done'
}

export function StudyTab({ courseId, kind, items, loaded, openId, onOpen, onChanged, onDeleted }: StudyTabProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  // the card to put focus back on when its page closes
  const returnFocusRef = useRef<number | null>(null)
  const open = openId === null ? null : (items.find((i) => i.id === openId) ?? null)

  useEffect(() => {
    if (openId !== null) {
      returnFocusRef.current = openId
      return
    }
    const target = returnFocusRef.current
    returnFocusRef.current = null
    if (target !== null) listRef.current?.querySelector<HTMLElement>(`[data-study-id="${target}"]`)?.focus()
  }, [openId])
  if (open && canOpen(open)) {
    return (
      <StudyItemPage
        key={open.id}
        courseId={courseId}
        item={open}
        onChanged={onChanged}
        onBack={() => onOpen(null)}
        onDeleted={() => {
          // nothing to return to
          returnFocusRef.current = null
          onDeleted(open.id)
          onOpen(null)
        }}
      />
    )
  }

  if (openId !== null && !loaded) {
    return (
      <p className="py-10 text-center text-muted" role="status">
        {t('feed.loading')}
      </p>
    )
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-muted">{t(`courses.study.empty.${kind}`)}</p>
  }

  return (
    <div ref={listRef} className="space-y-4">
      {openId !== null && !open && (
        <p role="status" className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
          {t('courses.study.reader.gone')}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <StudyCard
            key={item.id}
            courseId={courseId}
            item={item}
            onOpen={canOpen(item) ? () => onOpen(item.id) : null}
            onChanged={onChanged}
            onDeleted={() => onDeleted(item.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function StudyCard({
  courseId,
  item,
  onOpen,
  onChanged,
  onDeleted,
}: {
  courseId: number
  item: StudyItemSummary
  // null while it can't be opened yet
  onOpen: (() => void) | null
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
          {onOpen ? (
            <a href={coursePath(courseId, STUDY_SECTIONS[item.kind], item.id)} onClick={inAppClick(onOpen)} data-study-id={item.id} className="hover:underline">
              {title}
            </a>
          ) : (
            title
          )}
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
        {onOpen && (
          // the title is the link; this is the same action as a button, for a bigger target
          <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true" className={`${smallPrimaryButton} ms-1`}>
            {item.kind === 'summary' ? t('courses.study.read') : item.attempts_count === 0 ? t('courses.study.take') : t('courses.study.open')}
          </button>
        )}
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

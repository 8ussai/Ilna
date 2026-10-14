import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../api/client'
import type { CourseMaterial, CourseNote } from '../../api/courses'
import { fetchUsage } from '../../api/me'
import type { DailyUsage } from '../../api/me'
import { createStudyItem, QUESTION_COUNTS, STUDY_MAX_SOURCES } from '../../api/study'
import type { QuestionCount, StudyItemSummary, StudyKind, StudyLanguage, SummaryLength } from '../../api/study'
import { formatRelative, parseServerDate } from '../../dates'
import { Dialog } from '../Dialog'
import { controlClass } from '../Field'
import { primaryButtonInline, secondaryButtonInline } from '../styles'

type GenerateDialogProps = {
  kind: StudyKind
  courseId: number
  materials: CourseMaterial[]
  notes: CourseNote[]
  onClose: () => void
  onCreated: (item: StudyItemSummary) => void
}

type Choice = {
  key: string
  type: 'material' | 'note'
  id: number
  name: string
  // why it can't be picked, if it can't
  unavailable: string | null
}

// Picks the files, recordings and notes a summary or quiz is made from, and how it's made.
export function GenerateDialog({ kind, courseId, materials, notes, onClose, onCreated }: GenerateDialogProps) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // this kind's daily limit; null until known (the server checks it either way)
  const [usage, setUsage] = useState<DailyUsage | null>(null)
  const [length, setLength] = useState<SummaryLength>('brief')
  const [count, setCount] = useState<QuestionCount>(10)
  const [language, setLanguage] = useState<StudyLanguage | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const languageId = useId()

  useEffect(() => {
    let ignore = false
    fetchUsage()
      .then((u) => {
        if (!ignore) setUsage(u[kind])
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [kind])
  const usedUp = usage !== null && usage.used >= usage.limit

  const newestFirst = [...materials].sort((a, b) => b.id - a.id)
  const materialChoice = (m: CourseMaterial): Choice => ({
    key: `material-${m.id}`,
    type: 'material',
    id: m.id,
    name: m.file_name,
    // a recording is ready once it's transcribed and indexed
    unavailable:
      m.transcript?.status === 'failed'
        ? t('courses.study.generate.transcriptFailed')
        : m.is_rag_indexed
          ? null
          : t('courses.study.generate.preparing'),
  })
  const groups: { name: 'files' | 'recordings' | 'notes'; choices: Choice[] }[] = [
    { name: 'files', choices: newestFirst.filter((m) => m.kind === 'document').map(materialChoice) },
    { name: 'recordings', choices: newestFirst.filter((m) => m.kind === 'audio').map(materialChoice) },
    {
      name: 'notes',
      choices: [...notes]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((n) => {
          const firstLine = n.kind === 'text' ? n.content.split('\n').find((line) => line.trim())?.trim() : undefined
          const empty = n.kind === 'text' && !n.title?.trim() && !n.content.trim()
          return {
            key: `note-${n.id}`,
            type: 'note' as const,
            id: n.id,
            name: n.title || firstLine || (n.kind === 'drawing' ? t('courses.notes.untitledDrawing') : t('courses.notes.untitled')),
            unavailable:
              n.kind === 'drawing'
                ? t('courses.study.generate.drawing')
                : empty
                  ? t('courses.study.generate.emptyNote')
                  : null,
          }
        }),
    },
  ]
  const available = groups.flatMap((g) => g.choices).filter((c) => !c.unavailable)
  const tooMany = selected.size > STUDY_MAX_SOURCES

  function toggle(keys: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (selected.size === 0 || tooMany || usedUp) return
    setBusy(true)
    setError('')
    try {
      const item = await createStudyItem(courseId, {
        kind,
        sources: available.filter((c) => selected.has(c.key)).map(({ type, id }) => ({ type, id })),
        language: language || null,
        ...(kind === 'summary' ? { length } : { num_questions: count }),
      })
      onCreated(item)
    } catch (err) {
      let message = t('errors.generic')
      if (err instanceof ApiError) {
        if (err.status === 0) message = t('errors.network')
        else if (err.status === 503) message = t('courses.study.generate.notSetUp')
        else if (err.status === 429) {
          // the last one was used in another tab meanwhile: the button then says when the next is free
          fetchUsage()
            .then((u) => setUsage(u[kind]))
            .catch(() => {})
          message = ''
        }
        else if (err.status === 400) message = t('courses.study.generate.sourceProblem')
      }
      setError(message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={t(`courses.study.generate.title.${kind}`)} onClose={onClose} size="lg">
      {groups.every((g) => g.choices.length === 0) ? (
        <div className="space-y-4">
          <p className="text-muted">{t('courses.study.generate.nothing')}</p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={secondaryButtonInline}>
              {t('feed.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <p className="text-muted">{t(`courses.study.generate.intro.${kind}`)}</p>



          <div className="space-y-4">
            {groups.map(
              (group) =>
                group.choices.length > 0 && (
                  <SourceGroup
                    key={group.name}
                    label={t(`courses.study.generate.groups.${group.name}`)}
                    choices={group.choices}
                    selected={selected}
                    onToggle={toggle}
                  />
                ),
            )}
          </div>

          {kind === 'summary' ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('courses.study.generate.length')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['brief', 'detailed'] as const).map((value) => (
                  <OptionCard key={value} name="length" checked={length === value} onChange={() => setLength(value)}>
                    <span className="block font-medium">{t(`courses.study.generate.lengths.${value}`)}</span>
                    <span className="block text-sm text-muted">{t(`courses.study.generate.lengths.${value}Hint`)}</span>
                  </OptionCard>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('courses.study.generate.questions')}</legend>
              <div className="flex flex-wrap gap-2">
                {QUESTION_COUNTS.map((value) => (
                  <OptionCard key={value} name="count" checked={count === value} onChange={() => setCount(value)} compact>
                    <span className="font-medium tabular-nums">{value}</span>
                  </OptionCard>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <label htmlFor={languageId} className="mb-1.5 block text-sm font-medium">
              {t('courses.study.generate.language')}
            </label>
            <select
              id={languageId}
              value={language}
              onChange={(e) => setLanguage(e.target.value as StudyLanguage | '')}
              aria-describedby={`${languageId}-hint`}
              className={`${controlClass} sm:w-64`}
            >
              <option value="">{t('courses.study.generate.languageAuto')}</option>
              <option value="ar" lang="ar">
                العربية
              </option>
              <option value="en" lang="en">
                English
              </option>
            </select>
            <p id={`${languageId}-hint`} className="mt-1.5 text-sm text-muted">
              {t('courses.study.generate.languageHint')}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-card px-5 py-4">
            <p className={`me-auto text-sm ${tooMany ? 'text-danger' : 'text-muted'}`} aria-live="polite">
              {tooMany
                ? t('courses.study.generate.tooMany', { max: STUDY_MAX_SOURCES })
                : t('courses.study.generate.selected', { count: selected.size })}
            </p>
            <button type="button" onClick={onClose} className={secondaryButtonInline}>
              {t('feed.cancel')}
            </button>
            <button type="submit" disabled={busy || selected.size === 0 || tooMany || usedUp} className={primaryButtonInline}>
              {busy
                ? t('courses.study.generate.submitting')
                : usedUp
                  ? t(`courses.study.generate.submitUsedUp.${kind}`, {
                      when: usage?.frees_at ? formatRelative(parseServerDate(usage.frees_at), i18n.language) : '',
                    })
                  : usage
                    ? t(`courses.study.generate.submitLeft.${kind}`, { left: usage.limit - usage.used })
                    : t(`courses.study.generate.submit.${kind}`)}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function SourceGroup({
  label,
  choices,
  selected,
  onToggle,
}: {
  label: string
  choices: Choice[]
  selected: Set<string>
  onToggle: (keys: string[], on: boolean) => void
}) {
  const { t } = useTranslation()
  const allRef = useRef<HTMLInputElement>(null)
  const pickable = choices.filter((c) => !c.unavailable).map((c) => c.key)
  const picked = pickable.filter((key) => selected.has(key)).length
  const all = pickable.length > 0 && picked === pickable.length

  // "some but not all" has no attribute of its own
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = picked > 0 && !all
  }, [picked, all])

  return (
    <fieldset className="rounded-xl border border-line">
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/60 px-4 py-2.5">
        <span aria-hidden="true" className="font-medium">
          {label}
        </span>
        {pickable.length > 1 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            {t('courses.study.generate.selectAll')}
            <input
              ref={allRef}
              type="checkbox"
              checked={all}
              onChange={(e) => onToggle(pickable, e.target.checked)}
              aria-label={`${t('courses.study.generate.selectAll')}: ${label}`}
              className="size-4 accent-accent"
            />
          </label>
        )}
      </div>
      <ul className="max-h-56 divide-y divide-line overflow-y-auto">
        {choices.map((choice) => (
          <li key={choice.key}>
            <label
              className={`flex items-center gap-3 px-4 py-2.5 ${choice.unavailable ? 'cursor-not-allowed text-muted' : 'cursor-pointer hover:bg-surface/60'}`}
            >
              <input
                type="checkbox"
                checked={selected.has(choice.key)}
                disabled={choice.unavailable !== null}
                onChange={(e) => onToggle([choice.key], e.target.checked)}
                className="size-4 shrink-0 accent-accent"
              />
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {choice.name}
              </span>
              {choice.unavailable && <span className="shrink-0 text-xs">{choice.unavailable}</span>}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

// a radio button drawn as a selectable card
function OptionCard({
  name,
  checked,
  onChange,
  compact = false,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  compact?: boolean
  children: ReactNode
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
        checked ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface'
      } ${compact ? 'min-w-16 items-center justify-center' : 'items-start'}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className={compact ? 'sr-only' : 'mt-1 accent-accent'} />
      <span>{children}</span>
    </label>
  )
}

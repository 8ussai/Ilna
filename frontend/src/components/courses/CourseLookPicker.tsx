import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { COURSE_COLORS } from '../../api/courses'
import type { CourseColor } from '../../api/courses'
import { controlClass, FieldMessage } from '../Field'
import { COURSE_COLOR_CLASS, EMOJI_CHOICES } from './courseColors'

type CourseLookPickerProps = {
  color: CourseColor | null
  emoji: string
  emojiError?: string
  onColorChange: (color: CourseColor | null) => void
  onEmojiChange: (emoji: string) => void
}

// The color swatches and the emoji field, used when creating a course and from a card's menu.
export function CourseLookPicker({ color, emoji, emojiError, onColorChange, onEmojiChange }: CourseLookPickerProps) {
  const { t } = useTranslation()
  const emojiId = useId()

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('courses.form.color')}</legend>
        <div className="flex flex-wrap gap-2">
          <Swatch selected={color === null} label={t('courses.colors.none')} onSelect={() => onColorChange(null)} className="bg-accent" />
          {COURSE_COLORS.map((name) => (
            <Swatch
              key={name}
              selected={color === name}
              label={t(`courses.colors.${name}`)}
              onSelect={() => onColorChange(name)}
              className={COURSE_COLOR_CLASS[name]}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={emojiId} className="mb-1.5 block text-sm font-medium">
          {t('courses.form.emoji')} <span className="font-normal text-muted">{t('courses.form.optional')}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={emojiId}
            value={emoji}
            onChange={(e) => onEmojiChange(e.target.value)}
            aria-invalid={emojiError ? true : undefined}
            aria-describedby={emojiError ? `${emojiId}-err` : `${emojiId}-hint`}
            className={`${controlClass} w-16 text-center text-xl ${emojiError ? 'border-danger' : ''}`}
          />
          <div role="group" aria-label={t('courses.form.emojiChoices')} className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={emoji === choice}
                onClick={() => onEmojiChange(emoji === choice ? '' : choice)}
                className={`grid size-9 place-items-center rounded-lg text-lg hover:bg-surface ${emoji === choice ? 'bg-surface ring-2 ring-accent' : ''}`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
        <FieldMessage id={emojiId} error={emojiError} hint={t('courses.form.emojiHint')} />
      </div>
    </div>
  )
}

function Swatch({ selected, label, onSelect, className }: { selected: boolean; label: string; onSelect: () => void; className: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={`grid size-9 place-items-center rounded-full text-white ${className} ${selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : ''}`}
    >
      {/* the check mark says "selected" without relying on the ring color alone */}
      {selected && (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 5 5 9-10" />
        </svg>
      )}
    </button>
  )
}

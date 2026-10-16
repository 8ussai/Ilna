import { useTranslation } from 'react-i18next'

import { COURSE_COLORS } from '../../api/courses'
import type { CourseColor } from '../../api/courses'
import { COURSE_COLOR_CLASS } from './courseColors'

type CourseLookPickerProps = {
  color: CourseColor | null
  onColorChange: (color: CourseColor | null) => void
}

// The color swatches, used when creating a course and from a card's menu.
export function CourseLookPicker({ color, onColorChange }: CourseLookPickerProps) {
  const { t } = useTranslation()

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

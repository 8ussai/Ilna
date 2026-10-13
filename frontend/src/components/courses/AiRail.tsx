import { useId } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { AI_FEATURES } from '../../aiFeatures'
import type { AiFeature } from '../../aiFeatures'

const TOOLS: { feature: AiFeature; icon: ReactNode }[] = [
  {
    feature: 'summarize',
    icon: <path d="M4 6h16M4 10h16M4 14h10M4 18h7m9-3 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" />,
  },
  {
    feature: 'quiz',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" />
      </>
    ),
  },
  {
    feature: 'voice',
    icon: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
  },
]

// The course's AI tools: a column on the start side from tablet width up, a bar along the bottom on phones.
// Tools that aren't live yet stay focusable (aria-disabled, not disabled) so everyone can find out they're coming.
export function AiRail({ onUse }: { onUse?: (feature: AiFeature) => void }) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('courses.ai.label')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur sm:sticky sm:inset-auto sm:top-32 sm:z-auto sm:w-16 sm:shrink-0 sm:self-start sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
    >
      <ul className="flex justify-around px-2 py-1.5 sm:flex-col sm:gap-2 sm:p-0">
        {TOOLS.map(({ feature, icon }) => (
          <li key={feature}>
            <RailButton feature={feature} live={AI_FEATURES[feature]} icon={icon} onUse={onUse} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

function RailButton({
  feature,
  live,
  icon,
  onUse,
}: {
  feature: AiFeature
  live: boolean
  icon: ReactNode
  onUse?: (feature: AiFeature) => void
}) {
  const { t } = useTranslation()
  const tipId = useId()

  return (
    // on phones the tooltip spans the bottom bar (the nav is its positioned parent), beside the button from tablet width up
    <div className="group sm:relative">
      <button
        type="button"
        aria-disabled={!live}
        aria-describedby={tipId}
        onClick={() => live && onUse?.(feature)}
        className={`flex w-20 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight sm:w-16 ${
          live ? 'text-fg hover:bg-surface' : 'cursor-default text-muted'
        }`}
      >
        <span className="relative">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon}
          </svg>
          {!live && (
            // the tooltip (the button's description) already says it's coming soon, so the name stays just the tool
            <span aria-hidden="true" className="absolute -end-3.5 -top-2 rounded-full bg-surface px-1 text-[9px] font-semibold text-muted ring-1 ring-line">
              {t('courses.ai.soon')}
            </span>
          )}
        </span>
        <span className="text-center">{t(`courses.ai.${feature}`)}</span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute inset-x-4 bottom-full z-30 mb-2 rounded-lg bg-fg px-3 py-2 text-xs text-bg opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 sm:inset-x-auto sm:bottom-auto sm:start-full sm:top-1/2 sm:mb-0 sm:ms-2 sm:w-52 sm:-translate-y-1/2"
      >
        {live ? t(`courses.ai.${feature}Tip`) : t('courses.ai.soonTip', { tool: t(`courses.ai.${feature}Tip`) })}
      </span>
    </div>
  )
}

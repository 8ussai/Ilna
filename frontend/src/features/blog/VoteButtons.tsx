import { useTranslation } from 'react-i18next'

import type { VoteDir } from '../../api/posts'
import { useReadOnly } from '../../lib/readOnly'

// the up or down arrow icon
function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d={up ? 'M12 5l7 9h-4.5v5h-5v-5H5z' : 'M12 19l-7-9h4.5V5h5v5H19z'} />
    </svg>
  )
}

// upvote and downvote buttons with the score between them
export function VoteButtons({
  count,
  myVote,
  disabled,
  onVote,
}: {
  count: number
  myVote: VoteDir
  disabled: boolean
  onVote: (dir: 1 | -1) => void
}) {
  const { t } = useTranslation()
  // a test account sees the score but can't vote
  const readOnly = useReadOnly()

  // one vote button, pressed when it's the reader's vote
  const button = (dir: 1 | -1) => {
    const active = myVote === dir
    const label = dir === 1 ? t('feed.upvote') : t('feed.downvote')
    return (
      <button
        type="button"
        disabled={disabled || readOnly}
        onClick={() => onVote(dir)}
        aria-pressed={active}
        aria-label={label}
        title={readOnly ? t('testAccount.noVote') : label}
        className={`grid size-8 place-items-center rounded-md hover:bg-surface ${readOnly ? 'disabled:cursor-not-allowed disabled:opacity-50' : 'disabled:cursor-wait'} ${
          active ? (dir === 1 ? 'text-accent' : 'text-danger') : 'text-muted hover:text-fg'
        }`}
      >
        <Arrow up={dir === 1} />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {button(1)}
      <span
        aria-label={t('feed.score', { count })}
        className={`min-w-6 text-center text-sm font-semibold tabular-nums ${
          myVote === 1 ? 'text-accent' : myVote === -1 ? 'text-danger' : ''
        }`}
      >
        {count}
      </span>
      {button(-1)}
    </div>
  )
}

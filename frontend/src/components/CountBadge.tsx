// A small unread-count pill; nothing when the count is 0. Decorative: callers put the count in their label.
export function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden="true"
      className={`grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs leading-none font-semibold text-accent-fg tabular-nums ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

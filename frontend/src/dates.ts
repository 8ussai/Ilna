// backend stores UTC without an offset marker
export function parseServerDate(value: string) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

export function formatDate(date: Date, lang: string) {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(date)
}

export function formatDateTime(date: Date, lang: string) {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

// "2 days ago" / "قبل يومين"
export function formatRelative(date: Date, lang: string, now = new Date()) {
  let value = (date.getTime() - now.getTime()) / 1000
  // "now" rather than counting seconds
  if (Math.abs(value) < 60) value = 0
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) {
      return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(Math.round(value), unit)
    }
    value /= size
  }
  return formatDate(date, lang)
}

// 75 -> "1:15", 3725 -> "1:02:05"; digits stay Latin, like a media player's
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

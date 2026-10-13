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

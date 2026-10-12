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

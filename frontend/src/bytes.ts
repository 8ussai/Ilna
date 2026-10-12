const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

// binary units (1 GB = 1024³ bytes) to match the backend's 5 GB limit
export function formatBytes(bytes: number, lang: string) {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return new Intl.NumberFormat(lang, {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
  }).format(value)
}

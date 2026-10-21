// The site's theme color (--accent), picked in Settings > Appearance.
// Presets match ACCENT_PRESETS in backend/backendConfig.py; premium can also pick any "#rrggbb".

type Pair = { accent: string; fg: string }
type AccentColors = { light: Pair; dark: Pair }

export const DEFAULT_ACCENT = 'orange'

// light-mode colors carry white text, dark-mode ones near-black, each at 4.5:1 or better;
// the new presets also read at 4.5:1 or better on every page background (orange, the original, at 4.1 on --surface)
export const ACCENT_PRESETS: Record<string, AccentColors> = {
  orange: { light: { accent: '#b85536', fg: '#ffffff' }, dark: { accent: '#d97757', fg: '#141413' } },
  blue: { light: { accent: '#2f63b0', fg: '#ffffff' }, dark: { accent: '#7aa7e6', fg: '#141413' } },
  green: { light: { accent: '#2e7445', fg: '#ffffff' }, dark: { accent: '#6cbd86', fg: '#141413' } },
  purple: { light: { accent: '#7448b0', fg: '#ffffff' }, dark: { accent: '#b296e3', fg: '#141413' } },
  teal: { light: { accent: '#1f7272', fg: '#ffffff' }, dark: { accent: '#5cbdb8', fg: '#141413' } },
  rose: { light: { accent: '#b33a5f', fg: '#ffffff' }, dark: { accent: '#e88aa5', fg: '#141413' } },
}

export const PRESET_NAMES = Object.keys(ACCENT_PRESETS)

export function isCustomAccent(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value)
}

// the page backgrounds the accent has to read on (index.css --bg/--surface/--card), per theme
const BACKGROUNDS = {
  light: ['#faf9f5', '#f0eee6', '#ffffff'],
  dark: ['#1f1e1d', '#262624', '#2b2a28'],
}
const DARK_TEXT = '#141413'
const MIN_CONTRAST = 4.5

function toRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

function toHex(rgb: number[]): string {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function mix(hex: string, toward: string, amount: number): string {
  const from = toRgb(hex)
  const to = toRgb(toward)
  return toHex(from.map((c, i) => c + (to[i] - c) * amount))
}

// darkens (light theme) or lightens (dark theme) the picked color just enough to read on every background,
// then picks white or near-black text for buttons, whichever is clearer
function readablePair(hex: string, theme: 'light' | 'dark'): Pair {
  const toward = theme === 'light' ? '#000000' : '#ffffff'
  let accent = hex
  for (let step = 1; step <= 20 && BACKGROUNDS[theme].some((bg) => contrast(accent, bg) < MIN_CONTRAST); step++) {
    accent = mix(hex, toward, step * 0.05)
  }
  const fg = contrast(accent, '#ffffff') >= contrast(accent, DARK_TEXT) ? '#ffffff' : DARK_TEXT
  return { accent, fg }
}

export function accentColors(value: string | null | undefined): AccentColors {
  if (isCustomAccent(value)) {
    const hex = value.toLowerCase()
    return { light: readablePair(hex, 'light'), dark: readablePair(hex, 'dark') }
  }
  return ACCENT_PRESETS[value ?? DEFAULT_ACCENT] ?? ACCENT_PRESETS[DEFAULT_ACCENT]
}

const STYLE_ID = 'ilna-accent'
// read by the script in index.html, so the color is there before the first paint
const STORAGE_KEY = 'ilna-accent-css'

// :root:root outranks index.css's :root rules, whichever stylesheet loads last
function accentCss({ light, dark }: AccentColors): string {
  return (
    `:root:root{--accent:${light.accent};--accent-fg:${light.fg}}` +
    `:root:root[data-theme="dark"]{--accent:${dark.accent};--accent-fg:${dark.fg}}`
  )
}

function setCss(css: string | null) {
  let style = document.getElementById(STYLE_ID)
  if (css === null) {
    style?.remove()
  } else {
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = css
  }
  try {
    if (css === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, css)
  } catch {
    // storage may be blocked; the color still shows once the account loads
  }
}

// null or the default is plain index.css; a custom color only applies while the user is premium
export function applyAccent(value: string | null | undefined, isPremium: boolean) {
  const usable = isCustomAccent(value) ? isPremium : !!value && value !== DEFAULT_ACCENT && value in ACCENT_PRESETS
  setCss(usable ? accentCss(accentColors(value)) : null)
}

// on logout: the landing page is always the default orange
export function clearAccent() {
  setCss(null)
}

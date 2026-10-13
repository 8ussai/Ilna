import type { CourseColor } from '../../api/courses'

// full class names so Tailwind finds them; the 500 shades read well on both the light and dark backgrounds
export const COURSE_COLOR_CLASS: Record<CourseColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-600',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  red: 'bg-red-500',
  gray: 'bg-stone-500',
}

// a course without a color uses the app's accent
export function courseColorClass(color: CourseColor | null) {
  return color ? COURSE_COLOR_CLASS[color] : 'bg-accent'
}

// a few to pick from; any single emoji can be typed instead
export const EMOJI_CHOICES = ['📘', '🧪', '📐', '💻', '🧬', '📊', '⚖️', '🎨', '🌍', '🩺']

// one user-perceived character (flags and skin tones are several code points)
export function isSingleEmoji(value: string) {
  const graphemes = [...new Intl.Segmenter().segment(value)]
  return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
}

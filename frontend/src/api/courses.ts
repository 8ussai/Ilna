import { authBlob, authRequest, authUpload } from './client'

// preset names; courseColors.ts maps them to shades that work in both themes
export const COURSE_COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'red', 'gray'] as const
export type CourseColor = (typeof COURSE_COLORS)[number]

export const COURSE_TITLE_MAX = 100
export const COURSE_DESCRIPTION_MAX = 500

// what the backend accepts, by extension (backendConfig.DOCUMENT_EXTENSIONS / AUDIO_EXTENSIONS)
export const DOCUMENT_EXTENSIONS = ['pdf', 'ppt', 'pptx']
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'webm', 'ogg']

export type Course = {
  id: number
  user_id: number
  title: string
  description: string | null
  color: CourseColor | null
  emoji: string | null
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

// a card in the courses grid
export type CourseSummary = Course & {
  documents_count: number
  audio_count: number
  links_count: number
  notes_count: number
}

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'failed'

export type CourseMaterial = {
  id: number
  course_id: number
  file_name: string
  kind: 'document' | 'audio'
  mime_type: string | null
  duration_sec: number | null
  size_bytes: number
  is_rag_indexed: boolean
  transcript: { status: TranscriptStatus; progress: number; language: string | null; error: string | null } | null
  created_at: string
  updated_at: string
}

export type CourseNote = {
  id: number
  course_id: number
  kind: 'text' | 'drawing'
  title: string | null
  content: string
  created_at: string
  updated_at: string
}

export type CourseLink = {
  id: number
  course_id: number
  title: string
  url: string
  created_at: string
  updated_at: string
}

export type CourseDetail = Course & {
  materials: CourseMaterial[]
  notes: CourseNote[]
  links: CourseLink[]
}

export type CourseInput = {
  title: string
  description: string | null
  color: CourseColor | null
  emoji: string | null
}

const json = { 'Content-Type': 'application/json' }

export function fetchCourses() {
  return authRequest<CourseSummary[]>('/courses/')
}

// also marks the course as opened, which moves it to the front of the grid
export function fetchCourse(id: number) {
  return authRequest<CourseDetail>(`/courses/${id}`)
}

export function createCourse(input: CourseInput) {
  return authRequest<Course>('/courses/', { method: 'POST', headers: json, body: JSON.stringify(input) })
}

// only the fields sent change; null clears description, color and emoji
export function updateCourse(id: number, changes: Partial<CourseInput>) {
  return authRequest<Course>(`/courses/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify(changes) })
}

export function deleteCourse(id: number) {
  return authRequest<null>(`/courses/${id}`, { method: 'DELETE' })
}

export function addCourseLink(courseId: number, title: string, url: string) {
  return authRequest<CourseLink>(`/courses/${courseId}/links`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ title, url }),
  })
}

export function uploadCourseMaterial(
  courseId: number,
  file: File,
  options: { durationSec?: number | null; onProgress: (fraction: number) => void; signal?: AbortSignal },
) {
  const form = new FormData()
  form.append('file', file)
  if (options.durationSec != null) form.append('duration_sec', String(options.durationSec))
  return authUpload<CourseMaterial>(`/courses/${courseId}/upload`, form, options.onProgress, options.signal)
}

export function fetchMaterialFile(courseId: number, materialId: number) {
  return authBlob(`/courses/${courseId}/materials/${materialId}/file`)
}

export function fileExtension(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

import { authBlob, authRequest, authUpload } from './client'

// preset names; courseColors.ts maps them to shades that work in both themes
export const COURSE_COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'red', 'gray'] as const
export type CourseColor = (typeof COURSE_COLORS)[number]

export const COURSE_TITLE_MAX = 100
export const COURSE_DESCRIPTION_MAX = 500

// what the backend accepts, by extension (backendConfig.DOCUMENT_EXTENSIONS / AUDIO_EXTENSIONS)
export const DOCUMENT_EXTENSIONS = ['pdf', 'ppt', 'pptx']
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'webm', 'ogg']
// largest single file or recording (backendConfig.MAX_UPLOAD_BYTES)
export const MAX_UPLOAD_BYTES = 95 * 1024 ** 2

export type Course = {
  id: number
  user_id: number
  title: string
  description: string | null
  color: CourseColor | null
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

type TranscriptStatus = 'pending' | 'processing' | 'done' | 'failed'

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

// only the fields sent change; null clears description and color
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

// for polling indexing and transcription; doesn't count as opening the course
export function fetchMaterials(courseId: number) {
  return authRequest<CourseMaterial[]>(`/courses/${courseId}/materials`)
}

export function renameMaterial(courseId: number, materialId: number, fileName: string) {
  return authRequest<CourseMaterial>(`/courses/${courseId}/materials/${materialId}`, {
    method: 'PATCH',
    headers: json,
    body: JSON.stringify({ file_name: fileName }),
  })
}

export function deleteMaterial(courseId: number, materialId: number) {
  return authRequest<null>(`/courses/${courseId}/materials/${materialId}`, { method: 'DELETE' })
}

export type TranscriptLanguage = 'ar' | 'en'
export type TranscriptSegment = { start: number; end: number; text: string }
export type Transcript = NonNullable<CourseMaterial['transcript']> & { segments: TranscriptSegment[] | null }

export function fetchTranscript(courseId: number, materialId: number) {
  return authRequest<Transcript>(`/courses/${courseId}/materials/${materialId}/transcript`)
}

// null language = detect it
export function retryTranscript(courseId: number, materialId: number, language: TranscriptLanguage | null) {
  return authRequest<Transcript>(`/courses/${courseId}/materials/${materialId}/transcript/retry`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ language }),
  })
}

export function updateCourseLink(courseId: number, linkId: number, changes: { title?: string; url?: string }) {
  return authRequest<CourseLink>(`/courses/${courseId}/links/${linkId}`, {
    method: 'PATCH',
    headers: json,
    body: JSON.stringify(changes),
  })
}

export function deleteCourseLink(courseId: number, linkId: number) {
  return authRequest<null>(`/courses/${courseId}/links/${linkId}`, { method: 'DELETE' })
}

// the backend's limits (MAX_TEXT_NOTE_CHARS, the note title length)
export const NOTE_CONTENT_MAX = 100_000
export const NOTE_TITLE_MAX = 200

export function createNote(courseId: number, note: { title: string | null; content: string; kind?: CourseNote['kind'] }) {
  return authRequest<CourseNote>(`/courses/${courseId}/notes`, { method: 'POST', headers: json, body: JSON.stringify(note) })
}

// null title clears it
export function updateNote(courseId: number, noteId: number, changes: { title?: string | null; content?: string }) {
  return authRequest<CourseNote>(`/courses/${courseId}/notes/${noteId}`, {
    method: 'PATCH',
    headers: json,
    body: JSON.stringify(changes),
  })
}

export function deleteNote(courseId: number, noteId: number) {
  return authRequest<null>(`/courses/${courseId}/notes/${noteId}`, { method: 'DELETE' })
}

// the extension a download gets when a renamed material's name no longer ends in one
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
}

export function downloadName(material: CourseMaterial) {
  const extension = material.mime_type ? MIME_EXTENSIONS[material.mime_type] : undefined
  if (!extension || fileExtension(material.file_name) === extension) return material.file_name
  return `${material.file_name}.${extension}`
}

export function isAudio(name: string) {
  return AUDIO_EXTENSIONS.includes(fileExtension(name))
}

export function fileExtension(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

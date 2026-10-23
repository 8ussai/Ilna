import { authRequest } from './client'
import type { CourseColor, CourseOwner } from './courses'

// What someone sees before adding a course (backend/courses/sharing_schemas.py)
export type CoursePreview = {
  id: number
  title: string
  description: string | null
  color: CourseColor | null
  owner: CourseOwner
  is_public: boolean
  documents_count: number
  audio_count: number
  links_count: number
  is_owner: boolean
  is_member: boolean
  created_at: string
}

export type ShareTargetType = 'university' | 'college' | 'major' | 'friends' | 'user'
// the targets shared with as a whole group; people are shared with one by one
export type ShareGroup = Exclude<ShareTargetType, 'user'>

export type CourseShare = { id: number; target_type: ShareTargetType; user: CourseOwner | null }

export type Sharing = {
  share_code: string
  is_public: boolean
  notes_downloadable: boolean
  shares: CourseShare[]
  members_count: number
}

// a request with a JSON body
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

// courses shared with you that you haven't added or ignored
export function fetchSharedWithMe() {
  return authRequest<CoursePreview[]>('/courses/shared-with-me')
}

// a private course's code gives the same 404 as a wrong one
export function findCourseByCode(code: string) {
  return authRequest<CoursePreview>(`/courses/by-code/${encodeURIComponent(code.trim())}`)
}

// adds someone else's course to the student's courses, read-only
export function addSharedCourse(courseId: number) {
  return authRequest<CoursePreview>(`/courses/${courseId}/membership`, { method: 'POST' })
}

// takes an added course off the student's list
export function leaveCourse(courseId: number) {
  return authRequest<null>(`/courses/${courseId}/membership`, { method: 'DELETE' })
}

// hides a shared course from "Shared with you" for good
export function ignoreSharedCourse(courseId: number) {
  return authRequest<null>(`/courses/${courseId}/ignore`, { method: 'POST' })
}

// --- the owner's side ---

// the owner's sharing settings for a course
export function fetchSharing(courseId: number) {
  return authRequest<Sharing>(`/courses/${courseId}/sharing`)
}

// gives a course a new ID; the old one stops working
export function renewShareCode(courseId: number) {
  return authRequest<Sharing>(`/courses/${courseId}/sharing/new-code`, { method: 'POST' })
}

// Everything the Share dialog sets, saved at once by its Share button (backend SharingApply).
export type SharingDraft = { is_public: boolean; notes_downloadable: boolean; groups: ShareGroup[]; user_ids: number[] }

// saves the Share dialog and sends the course again to everyone it's shared with, even people who ignored it
export function applySharing(courseId: number, draft: SharingDraft) {
  return authRequest<Sharing>(`/courses/${courseId}/sharing`, json('PUT', draft))
}

// how many people who added the course the draft would remove, asked before saving it
export function fetchAccessLoss(courseId: number, draft: SharingDraft) {
  return authRequest<{ members_losing: number }>(`/courses/${courseId}/sharing/impact`, json('POST', draft))
}

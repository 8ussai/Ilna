import { authRequest } from './client'
import type { CourseColor, CourseOwner } from './courses'

// What someone sees before adding a course (backend/schemas/course_sharing.py)
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

export type CourseShare = { id: number; target_type: ShareTargetType; user: CourseOwner | null }

export type Sharing = { share_code: string; is_public: boolean; shares: CourseShare[]; members_count: number }

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

export function addSharedCourse(courseId: number) {
  return authRequest<CoursePreview>(`/courses/${courseId}/membership`, { method: 'POST' })
}

export function leaveCourse(courseId: number) {
  return authRequest<null>(`/courses/${courseId}/membership`, { method: 'DELETE' })
}

export function ignoreSharedCourse(courseId: number) {
  return authRequest<null>(`/courses/${courseId}/ignore`, { method: 'POST' })
}

// --- the owner's side ---

export function fetchSharing(courseId: number) {
  return authRequest<Sharing>(`/courses/${courseId}/sharing`)
}

export function setCoursePublic(courseId: number, isPublic: boolean) {
  return authRequest<Sharing>(`/courses/${courseId}/sharing`, json('PATCH', { is_public: isPublic }))
}

export function renewShareCode(courseId: number) {
  return authRequest<Sharing>(`/courses/${courseId}/sharing/new-code`, { method: 'POST' })
}

export function addShare(courseId: number, targetType: ShareTargetType, userId?: number) {
  return authRequest<Sharing>(`/courses/${courseId}/shares`, json('POST', { target_type: targetType, user_id: userId ?? null }))
}

export function removeShare(courseId: number, shareId: number) {
  return authRequest<Sharing>(`/courses/${courseId}/shares/${shareId}`, { method: 'DELETE' })
}

// how many people who added the course a change would remove, asked before confirming it
export function fetchAccessLoss(courseId: number, change: { makePrivate: true } | { removeShare: number }) {
  const params = new URLSearchParams(
    'makePrivate' in change ? { make_private: 'true' } : { remove_share: String(change.removeShare) },
  )
  return authRequest<{ members_losing: number }>(`/courses/${courseId}/sharing/impact?${params}`)
}

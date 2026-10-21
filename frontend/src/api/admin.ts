import { ApiError, blobRequest, request } from './client'
import type { MaintenanceStatus } from './meta'
import type { Author, PostImage, PostScope } from './posts'

// sessionStorage, so the admin login ends when the tab is closed; kept apart from the student login
const ADMIN_TOKEN_KEY = 'ilna-admin-token'

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // storage may be blocked; the admin just logs in again after a reload
  }
}

let onAdminUnauthorized: (() => void) | null = null

// AdminApp sets this so an expired admin login goes back to the code form
export function setAdminUnauthorizedHandler(handler: (() => void) | null) {
  onAdminUnauthorized = handler
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    return await request<T>(`/admin${path}`, { ...init, headers }, false)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) onAdminUnauthorized?.()
    throw err
  }
}

export function fetchAdminPostImage(postId: number, imageId: number) {
  return blobRequest(`/admin/posts/${postId}/images/${imageId}`, getAdminToken(), false)
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function requestAdminCode(email: string) {
  return request<{ detail: string }>('/admin/request-code', json({ email }), false)
}

export async function verifyAdminCode(email: string, code: string) {
  const { access_token } = await request<{ access_token: string; expires_at: string }>(
    '/admin/verify-code',
    json({ email, code }),
    false,
  )
  return access_token
}

export function fetchAdminSession() {
  return adminRequest<{ email: string }>('/session')
}

export type AdminUser = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_verified: boolean
  is_banned: boolean
  banned_reason: string | null
  banned_at: string | null
  is_premium: boolean
  premium_since: string | null
  // made from the panel as testuser{id}; email is a stand-in, and the account can be turned off
  is_test: boolean
  is_active: boolean
  created_at: string
  country: string
  university: string
  college: string
  major: string
  posts_count: number
  replies_count: number
  courses_count: number
  storage_bytes: number
}

export const ADMIN_USERS_PAGE = 25

export type AdminUserFilters = { premium?: boolean; test?: boolean }

export function fetchAdminUsers(q: string, offset = 0, filters: AdminUserFilters = {}) {
  const params = new URLSearchParams({ q, limit: String(ADMIN_USERS_PAGE), offset: String(offset) })
  if (filters.premium) params.set('premium', 'true')
  if (filters.test) params.set('test', 'true')
  return adminRequest<{ items: AdminUser[]; total: number }>(`/users?${params}`)
}

export function banUser(id: number, reason: string) {
  return adminRequest<AdminUser>(`/users/${id}/ban`, json({ reason }))
}

export function unbanUser(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/unban`, { method: 'POST' })
}

export type TestUserInput = {
  first_name: string
  last_name: string
  country: string
  university: string
  college: string
  major: string
}

// makes testuser{id} with a generated password
export function createTestUser(input: TestUserInput) {
  return adminRequest<{ user: AdminUser; password: string }>('/test-users', json(input))
}

// the test account's current password; 409 if it can't be read back (SECRET_KEY changed), then make a new one
export function fetchTestPassword(id: number) {
  return adminRequest<{ password: string }>(`/users/${id}/test-password`)
}

// a new generated password; the test account is logged out everywhere
export function newTestPassword(id: number) {
  return adminRequest<{ password: string }>(`/users/${id}/test-password`, { method: 'POST' })
}

export function activateTestUser(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/activate`, { method: 'POST' })
}

// logs the test account out at once; its data stays
export function deactivateTestUser(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/deactivate`, { method: 'POST' })
}

// lasts until removed; the student gets a notification
export function grantPremium(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/premium`, { method: 'POST' })
}

export function removePremium(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/unpremium`, { method: 'POST' })
}

export function verifyUser(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/verify`, { method: 'POST' })
}

export function resendUserCode(id: number) {
  return adminRequest<null>(`/users/${id}/resend-code`, { method: 'POST' })
}

export function deleteUser(id: number, confirmUsername: string) {
  return adminRequest<null>(`/users/${id}/delete`, json({ confirm_username: confirmUsername }))
}

export type AdminPost = {
  id: number
  content: string
  scope: PostScope
  university: string
  college: string
  major: string
  created_at: string
  author: { id: number; username: string; first_name: string; last_name: string }
  is_admin_post: boolean
  pinned_until: string | null
  // pinned_until is still ahead
  is_pinned: boolean
  votes_count: number
  replies_count: number
  // posted anonymously: what everyone else sees in place of the author
  shown_as: Author | null
  images: PostImage[]
}

export type AdminReply = {
  id: number
  parent_id: number | null
  // empty and author-less for placeholders
  content: string
  is_deleted: boolean
  removed_by_admin: boolean
  author: AdminPost['author'] | null
  created_at: string
  votes_count: number
  // posted anonymously: what everyone else sees in place of the author
  shown_as: Author | null
}

export const ADMIN_POSTS_PAGE = 20

// adminOnly lists just the admin's own posts
export function fetchAdminPosts(scope: PostScope | '', q: string, offset = 0, adminOnly = false) {
  const params = new URLSearchParams({ q, limit: String(ADMIN_POSTS_PAGE), offset: String(offset) })
  if (scope) params.set('scope', scope)
  if (adminOnly) params.set('admin_only', 'true')
  return adminRequest<{ items: AdminPost[]; total: number }>(`/posts?${params}`)
}

export function fetchAdminPost(id: number) {
  return adminRequest<{ post: AdminPost; replies: AdminReply[] }>(`/posts/${id}`)
}

export function findAdminReply(id: number) {
  return adminRequest<{ reply_id: number; post_id: number }>(`/replies/${id}`)
}

export function removePost(id: number, reason: string) {
  return adminRequest<null>(`/posts/${id}/remove`, json({ reason }))
}

export function removeReply(id: number, reason: string) {
  return adminRequest<null>(`/replies/${id}/remove`, json({ reason }))
}

export type AdminReportGroup = {
  target_type: 'post' | 'reply'
  target_id: number
  // the post itself, or the one the reply is on
  post_id: number
  content: string
  author: AdminPost['author']
  scope: PostScope
  university: string
  college: string
  major: string
  created_at: string
  reports_count: number
  latest_at: string
  // the post or reply is anonymous: what everyone else sees in place of the author
  shown_as: Author | null
  // a reported post's pictures; empty for a reply
  images: PostImage[]
  reports: { reason: string; note: string | null; reporter: AdminPost['author']; created_at: string }[]
}

export function fetchAdminReports() {
  return adminRequest<AdminReportGroup[]>('/reports')
}

export function fetchOpenReportCount() {
  return adminRequest<{ count: number }>('/reports/count')
}

export function dismissReports(targetType: 'post' | 'reply', targetId: number) {
  return adminRequest<null>('/reports/dismiss', json({ target_type: targetType, target_id: targetId }))
}

export type MessageTarget = 'user' | 'everyone' | 'university' | 'college' | 'major'
// value is the university, college or major id from the catalog
export type MessageAudience = { target: MessageTarget; user_id?: number; value?: string }

export function previewMessage(audience: MessageAudience) {
  return adminRequest<{ count: number }>('/messages/preview', json(audience))
}

// confirmCount is the number the admin was shown; a 409 { code: 'count_changed', count } means it changed
export function sendMessage(audience: MessageAudience, message: string, confirmCount: number) {
  return adminRequest<{ count: number }>('/messages', json({ ...audience, message, confirm_count: confirmCount }))
}

// matches MAX_PIN_HOURS in backend/backendConfig.py
export const MAX_PIN_HOURS = 168

// value is the university, college or major id for a scoped blog; pinHours null means not pinned
export function createAdminPost(scope: PostScope, value: string | null, content: string, pinHours: number | null) {
  return adminRequest<AdminPost>('/posts', json({ scope, value, content, pin_hours: pinHours }))
}

// pinHours null unpins
export function pinAdminPost(id: number, pinHours: number | null) {
  return adminRequest<AdminPost>(`/posts/${id}/pin`, json({ pin_hours: pinHours }))
}

export function deleteAdminPost(id: number) {
  return adminRequest<null>(`/posts/${id}`, { method: 'DELETE' })
}

export type ContactFilter = 'open' | 'handled' | 'all'

export type AdminContactMessage = {
  id: number
  subject: string
  message: string
  created_at: string
  handled_at: string | null
  sender: AdminPost['author'] & { email: string; university: string; college: string; major: string }
}

export const ADMIN_CONTACT_PAGE = 20

export function fetchAdminContact(status: ContactFilter, offset = 0) {
  const params = new URLSearchParams({ status, limit: String(ADMIN_CONTACT_PAGE), offset: String(offset) })
  return adminRequest<{ items: AdminContactMessage[]; total: number }>(`/contact?${params}`)
}

export function fetchOpenContactCount() {
  return adminRequest<{ count: number }>('/contact/count')
}

export function markContactHandled(id: number, handled: boolean) {
  return adminRequest<AdminContactMessage>(`/contact/${id}/handled`, json({ handled }))
}

export type AdminLogEntry = {
  id: number
  action: string
  target_type: 'user' | 'post' | 'reply' | null
  target_id: number | null
  // what the backend recorded: reason, username, removed content, recipients, ...
  details: Record<string, unknown>
  created_at: string
}

export const ADMIN_LOG_PAGE = 30

export function fetchAdminLog(action: string, offset = 0) {
  const params = new URLSearchParams({ action, limit: String(ADMIN_LOG_PAGE), offset: String(offset) })
  return adminRequest<{ items: AdminLogEntry[]; total: number; actions: string[] }>(`/log?${params}`)
}

export function fetchMaintenance() {
  return adminRequest<MaintenanceStatus>('/maintenance')
}

// starts_at null = now; times as ISO strings with their offset. Also changes a window that's scheduled or on.
export function scheduleMaintenance(message: string, starts_at: string | null, ends_at: string) {
  return adminRequest<MaintenanceStatus>('/maintenance', { ...json({ message, starts_at, ends_at }), method: 'PUT' })
}

// opens the site now, or cancels a scheduled closing
export function endMaintenance() {
  return adminRequest<MaintenanceStatus>('/maintenance', { method: 'DELETE' })
}

// a login for the test user that works while the site is closed, until the window ends
export function enterAsTestUser(userId: number) {
  return adminRequest<{ token: string; expires_at: string }>(`/maintenance/enter/${userId}`, { method: 'POST' })
}

// --- public courses (private ones never reach the admin panel) ---

export type AdminCourse = {
  id: number
  title: string
  description: string | null
  share_code: string
  owner: { id: number; username: string; first_name: string; last_name: string; is_premium: boolean }
  documents_count: number
  audio_count: number
  links_count: number
  // people who added it
  members_count: number
  created_at: string
}

export type AdminCourseDetail = {
  course: AdminCourse
  materials: { id: number; file_name: string; kind: 'document' | 'audio'; size_bytes: number }[]
  links: { title: string; url: string }[]
  // content is empty for a drawing
  notes: { title: string | null; kind: 'text' | 'drawing'; content: string }[]
}

export const ADMIN_COURSES_PAGE = 20

export function fetchAdminCourses(q: string, offset = 0) {
  const params = new URLSearchParams({ q, offset: String(offset) })
  return adminRequest<{ items: AdminCourse[]; total: number }>(`/courses?${params}`)
}

export function fetchAdminCourse(id: number) {
  return adminRequest<AdminCourseDetail>(`/courses/${id}`)
}

export function fetchAdminCourseFile(courseId: number, materialId: number) {
  return blobRequest(`/admin/courses/${courseId}/materials/${materialId}/file`, getAdminToken(), false)
}

// deletes it for the owner and everyone who added it; the owner is told the reason
export function removeAdminCourse(id: number, reason: string) {
  return adminRequest<null>(`/courses/${id}/remove`, json({ reason }))
}

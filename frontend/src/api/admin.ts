import { ApiError, request } from './client'
import type { PostScope } from './posts'

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

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export function fetchAdminUsers(q: string, offset = 0) {
  const params = new URLSearchParams({ q, limit: String(ADMIN_USERS_PAGE), offset: String(offset) })
  return adminRequest<{ items: AdminUser[]; total: number }>(`/users?${params}`)
}

export function banUser(id: number, reason: string) {
  return adminRequest<AdminUser>(`/users/${id}/ban`, json({ reason }))
}

export function unbanUser(id: number) {
  return adminRequest<AdminUser>(`/users/${id}/unban`, { method: 'POST' })
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
  votes_count: number
  replies_count: number
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
}

export const ADMIN_POSTS_PAGE = 20

export function fetchAdminPosts(scope: PostScope | '', q: string, offset = 0) {
  const params = new URLSearchParams({ q, limit: String(ADMIN_POSTS_PAGE), offset: String(offset) })
  if (scope) params.set('scope', scope)
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

import { authRequest } from './client'
import type { PostScope } from './posts'

export type ActivityItem = {
  type: 'post' | 'reply'
  // the post's or the reply's id, depending on type
  id: number
  post_id: number
  scope: PostScope
  // a preview, cut to 300 characters by the backend
  content: string
  created_at: string
}

export const ACTIVITY_PAGE_SIZE = 20

export function fetchActivity(offset = 0) {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE), offset: String(offset) })
  return authRequest<ActivityItem[]>(`/me/activity?${params}`)
}

export type Storage = { used_bytes: number; limit_bytes: number }

export function fetchStorage() {
  return authRequest<Storage>('/me/storage')
}

// summaries or quizzes started in the last 24 hours, out of the limit;
// frees_at is when the oldest of them leaves the 24 hours (null when none were started)
export type DailyUsage = { used: number; limit: number; frees_at: string | null }
export type Usage = { storage: Storage; summary: DailyUsage; quiz: DailyUsage }

export function fetchUsage() {
  return authRequest<Usage>('/me/usage')
}

export type NotificationType = 'post_vote' | 'reply_vote' | 'post_reply' | 'reply_reply' | 'post_removed' | 'reply_removed' | 'admin_message'

export type AppNotification = {
  id: number
  type: NotificationType
  // 1 or -1 for votes, null for replies
  vote_dir: 1 | -1 | null
  actor: { id: number; username: string; first_name: string; last_name: string }
  // the hidden admin account ("Ilna Admin")
  actor_is_admin: boolean
  // the post to open; null when there's nothing to open (a removed post)
  post_id: number | null
  // the reply to open and highlight, if any
  reply_id: number | null
  // the start of the reply (or of the post for post votes); for removal notices, of what was removed
  preview: string
  // removal notices: the admin's reason and the #P42 / #R17 that was removed
  reason: string | null
  ref: string | null
  is_read: boolean
  created_at: string
}

export const NOTIFICATIONS_PAGE_SIZE = 20

export function fetchNotifications(offset = 0) {
  const params = new URLSearchParams({ limit: String(NOTIFICATIONS_PAGE_SIZE), offset: String(offset) })
  return authRequest<AppNotification[]>(`/me/notifications?${params}`)
}

export function fetchUnreadCount() {
  return authRequest<{ count: number }>('/me/notifications/unread-count')
}

export function markNotificationsRead(ids: number[]) {
  return authRequest<null>('/me/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export function sendContactMessage(subject: string, message: string) {
  return authRequest<null>('/contact/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, message }),
  })
}

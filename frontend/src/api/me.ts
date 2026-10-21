import type { Me } from './auth'
import { authRequest } from './client'
import type { Author, PostScope } from './posts'

export type ActivityItem = {
  type: 'post' | 'reply'
  // the post's or the reply's id, depending on type
  id: number
  post_id: number
  scope: PostScope
  // a preview, cut to 300 characters by the backend
  content: string
  created_at: string
  is_anonymous: boolean
}

export const ACTIVITY_PAGE_SIZE = 20

export function fetchActivity(offset = 0) {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE), offset: String(offset) })
  return authRequest<ActivityItem[]>(`/me/activity?${params}`)
}

export function setAccentColor(accent_color: string | null) {
  return authRequest<Me>('/me/accent-color', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accent_color }),
  })
}

export type Storage = { used_bytes: number; limit_bytes: number }

export function fetchStorage() {
  return authRequest<Storage>('/me/storage')
}

// summaries or quizzes started in the last 24 hours, out of the limit;
// frees_at is when the oldest of them leaves the 24 hours (null when none were started)
export type DailyUsage = { used: number; limit: number; frees_at: string | null }
// premium shows as unlimited summaries and quizzes; its limits are only a hidden cap.
// course_limit is null for premium, which can have any number of courses
export type Usage = { premium: boolean; storage: Storage; summary: DailyUsage; quiz: DailyUsage; course_limit: number | null }

export function fetchUsage() {
  return authRequest<Usage>('/me/usage')
}

type NotificationType =
  | 'post_vote'
  | 'reply_vote'
  | 'post_reply'
  | 'reply_reply'
  | 'post_removed'
  | 'reply_removed'
  | 'admin_message'
  // from the admin when premium is turned on
  | 'premium_granted'
  // someone shared a course with the reader by name; preview is its title
  | 'course_shared'
  // the admin removed the reader's public course; preview is its title, ref its ID
  | 'course_removed'

export type AppNotification = {
  id: number
  type: NotificationType
  // 1 or -1 for votes, null for replies
  vote_dir: 1 | -1 | null
  // blank names and anon_number set when it was an anonymous reply
  actor: Author
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
  // course_shared: the course (it may be gone by now)
  course_id: number | null
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

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

export type NotificationType = 'post_vote' | 'reply_vote' | 'post_reply' | 'reply_reply'

export type AppNotification = {
  id: number
  type: NotificationType
  // 1 or -1 for votes, null for replies
  vote_dir: 1 | -1 | null
  actor: { id: number; username: string; first_name: string; last_name: string }
  post_id: number
  // the reply to open and highlight, if any
  reply_id: number | null
  // the start of the reply (or of the post for post votes)
  preview: string
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

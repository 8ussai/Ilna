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

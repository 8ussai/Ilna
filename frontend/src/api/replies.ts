import { authRequest } from './client'
import type { Post, VoteDir } from './posts'

export type Reply = {
  id: number
  post_id: number
  parent_id: number | null
  user_id: number | null
  // empty and author-less when is_deleted is true
  content: string
  is_deleted: boolean
  // a placeholder the admin left, shown as "[removed by admin]"
  removed_by_admin: boolean
  created_at: string
  votes_count: number
  my_vote: VoteDir
  author: Post['author'] | null
}

// the whole thread, flat; best-voted first, then oldest
export function fetchReplies(postId: number) {
  return authRequest<Reply[]>(`/posts/${postId}/replies`)
}

export function createReply(postId: number, content: string, parentId: number | null) {
  return authRequest<Reply>(`/posts/${postId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parent_id: parentId }),
  })
}

export function deleteReply(id: number) {
  return authRequest<null>(`/replies/${id}`, { method: 'DELETE' })
}

export function voteReply(id: number, dir: 1 | -1) {
  return authRequest<{ vote_dir: VoteDir; votes_count: number }>(`/replies/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote_dir: dir }),
  })
}

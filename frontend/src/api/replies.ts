import { authRequest } from './client'
import type { Post, VoteDir } from './posts'

export type Reply = {
  id: number
  post_id: number
  parent_id: number | null
  // null when deleted or anonymous; use is_mine for "is this mine"
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
  is_anonymous: boolean
  // the reader wrote it, anonymous or not
  is_mine: boolean
  // the author already used their one switch between anonymous and named
  anonymity_switched: boolean
}

// the whole thread, flat; best-voted first, then oldest
export function fetchReplies(postId: number) {
  return authRequest<Reply[]>(`/posts/${postId}/replies`)
}

// replies to a post, or to a reply when parentId is set
export function createReply(postId: number, content: string, parentId: number | null, isAnonymous: boolean) {
  return authRequest<Reply>(`/posts/${postId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parent_id: parentId, is_anonymous: isAnonymous }),
  })
}

// allowed once per reply, by its author
export function setReplyAnonymity(id: number, isAnonymous: boolean) {
  return authRequest<Reply>(`/replies/${id}/anonymity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_anonymous: isAnonymous }),
  })
}

// deletes the student's own reply
export function deleteReply(id: number) {
  return authRequest<null>(`/replies/${id}`, { method: 'DELETE' })
}

// votes on a reply; the same vote again takes it back
export function voteReply(id: number, dir: 1 | -1) {
  return authRequest<{ vote_dir: VoteDir; votes_count: number }>(`/replies/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote_dir: dir }),
  })
}

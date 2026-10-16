import { authRequest } from './client'

export type PostScope = 'general' | 'university' | 'college' | 'major'
export type PostSort = 'hot' | 'new' | 'top'
export type VoteDir = 1 | -1 | 0

export type Post = {
  id: number
  user_id: number
  content: string
  scope: PostScope
  // the author's catalog ids when they posted
  university: string
  college: string
  major: string
  created_at: string
  votes_count: number
  my_vote: VoteDir
  replies_count: number
  author: { id: number; username: string; first_name: string; last_name: string; is_premium: boolean }
  // written by the admin ("Ilna Admin"); can't be reported
  is_admin_post: boolean
  // pinned to the top of its blog right now
  is_pinned: boolean
}

export const PAGE_SIZE = 20

export function fetchPosts(scope: PostScope, sort: PostSort, offset = 0) {
  const params = new URLSearchParams({ scope, sort, limit: String(PAGE_SIZE), offset: String(offset) })
  return authRequest<Post[]>(`/posts/?${params}`)
}

export function fetchPost(id: number) {
  return authRequest<Post>(`/posts/${id}`)
}

export function createPost(scope: PostScope, content: string) {
  return authRequest<Post>('/posts/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, content }),
  })
}

// voting the same direction again removes the vote
export function votePost(id: number, dir: 1 | -1) {
  return authRequest<{ vote_dir: VoteDir; votes_count: number }>(`/posts/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote_dir: dir }),
  })
}

export function deletePost(id: number) {
  return authRequest<null>(`/posts/${id}`, { method: 'DELETE' })
}

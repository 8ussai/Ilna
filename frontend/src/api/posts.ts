import { authRequest } from './client'

export type PostScope = 'general' | 'university' | 'college' | 'major'

export type Post = {
  id: number
  user_id: number
  content: string
  scope: PostScope
  created_at: string
  votes_count: number
  author: { id: number; username: string; first_name: string; last_name: string }
}

export const PAGE_SIZE = 20

export function fetchPosts(scope: PostScope, offset = 0) {
  const params = new URLSearchParams({ scope, limit: String(PAGE_SIZE), offset: String(offset) })
  return authRequest<Post[]>(`/posts/?${params}`)
}

export function createPost(scope: PostScope, content: string) {
  return authRequest<Post>('/posts/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, content }),
  })
}

export function deletePost(id: number) {
  return authRequest<null>(`/posts/${id}`, { method: 'DELETE' })
}

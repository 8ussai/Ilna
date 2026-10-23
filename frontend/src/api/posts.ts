import { authBlob, authRequest } from './client'

export type PostScope = 'general' | 'university' | 'college' | 'major'
export type PostSort = 'hot' | 'new' | 'top'
export type VoteDir = 1 | -1 | 0

// For an anonymous post or reply the id, names and username are blank. In its thread an anonymous
// post's author replying anonymously is "Author" (is_thread_author); anyone else is "Anonymous N"
// (anon_number); the anonymous post itself has neither. See components/Anonymous.tsx
export type Author = {
  id: number
  username: string
  first_name: string
  last_name: string
  is_premium: boolean
  anon_number?: number | null
  is_thread_author?: boolean
}

// shown from /posts/{post id}/images/{id}; the size keeps the space while it loads
// version goes in the address: SQLite reuses a deleted post's ids, and the browser caches pictures for a day
export type PostImage = { id: number; width: number; height: number; is_animated: boolean; version: string }

// matches backend/config.py
export const MAX_POST_IMAGES = 4
export const MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024
export const POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export type Post = {
  id: number
  // null when the post is anonymous; use is_mine for "is this mine"
  user_id: number | null
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
  author: Author
  // written by the admin ("Ilna Admin"); can't be reported
  is_admin_post: boolean
  // pinned to the top of its blog right now
  is_pinned: boolean
  is_anonymous: boolean
  // the reader wrote it, anonymous or not
  is_mine: boolean
  // the author already used their one switch between anonymous and named
  anonymity_switched: boolean
  images: PostImage[]
}

export const PAGE_SIZE = 20

// one page of a blog
export function fetchPosts(scope: PostScope, sort: PostSort, offset = 0) {
  const params = new URLSearchParams({ scope, sort, limit: String(PAGE_SIZE), offset: String(offset) })
  return authRequest<Post[]>(`/posts/?${params}`)
}

// one post
export function fetchPost(id: number) {
  return authRequest<Post>(`/posts/${id}`)
}

// a form, so the pictures go up with the text in one request
export function createPost(scope: PostScope, content: string, isAnonymous: boolean, images: File[] = []) {
  const form = new FormData()
  form.append('scope', scope)
  form.append('content', content)
  form.append('is_anonymous', String(isAnonymous))
  for (const image of images) form.append('images', image)
  return authRequest<Post>('/posts/', { method: 'POST', body: form })
}

// a post's picture, fetched with the login
export function fetchPostImage(postId: number, image: PostImage) {
  return authBlob(`/posts/${postId}/images/${image.id}?v=${image.version}`)
}

// allowed once per post, by its author
export function setPostAnonymity(id: number, isAnonymous: boolean) {
  return authRequest<Post>(`/posts/${id}/anonymity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_anonymous: isAnonymous }),
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

// deletes the student's own post
export function deletePost(id: number) {
  return authRequest<null>(`/posts/${id}`, { method: 'DELETE' })
}

import { authRequest } from './client'

// What anyone can see about a student (backend/friends/schemas.py); never their email.
export type PublicProfile = {
  id: number
  username: string
  first_name: string
  last_name: string
  is_premium: boolean
  university: string
  college: string
  major: string
  // on the viewer's friends list
  is_friend: boolean
}

// limit is 100, or 500 for premium
export type FriendList = { friends: PublicProfile[]; count: number; limit: number }

// students whose name or username matches, own university first
export function searchUsers(q: string, offset = 0) {
  const params = new URLSearchParams({ q, offset: String(offset) })
  return authRequest<PublicProfile[]>(`/users/search?${params}`)
}

// a student's profile card
export function fetchProfile(username: string) {
  return authRequest<PublicProfile>(`/users/${encodeURIComponent(username)}`)
}

// the student's friends list with its count and cap
export function fetchFriends() {
  return authRequest<FriendList>('/me/friends')
}

// one-way and silent, like Codeforces: the other person isn't asked or told
export function addFriend(userId: number) {
  return authRequest<PublicProfile>(`/me/friends/${userId}`, { method: 'PUT' })
}

// takes someone off the friends list
export function removeFriend(userId: number) {
  return authRequest<null>(`/me/friends/${userId}`, { method: 'DELETE' })
}

import { authRequest } from './client'

// What anyone can see about a student (backend/schemas/friend.py); never their email.
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

export function searchUsers(q: string, offset = 0) {
  const params = new URLSearchParams({ q, offset: String(offset) })
  return authRequest<PublicProfile[]>(`/users/search?${params}`)
}

export function fetchProfile(username: string) {
  return authRequest<PublicProfile>(`/users/${encodeURIComponent(username)}`)
}

export function fetchFriends() {
  return authRequest<FriendList>('/me/friends')
}

// one-way and silent, like Codeforces: the other person isn't asked or told
export function addFriend(userId: number) {
  return authRequest<PublicProfile>(`/me/friends/${userId}`, { method: 'PUT' })
}

export function removeFriend(userId: number) {
  return authRequest<null>(`/me/friends/${userId}`, { method: 'DELETE' })
}

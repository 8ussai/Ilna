import { createContext, useContext } from 'react'

import type { PublicProfile } from '../../api/friends'

// The logged-in student's friends list, loaded once by Home and shared by the ★ next to names,
// the profile card and the Friends page, so adding or removing shows everywhere at once.
export type Friends = {
  list: PublicProfile[]
  count: number
  limit: number
  loaded: boolean
  isFriend: (userId: number) => boolean
  add: (profile: PublicProfile) => Promise<void>
  remove: (userId: number) => Promise<void>
  // opens the profile card for a post or reply author
  openProfile: (username: string) => void
}

// does nothing (outside Home there's no list)
const noop = async () => {}

// outside Home (the admin panel) there's no list: no ★, nothing to open
export const FriendsContext = createContext<Friends>({
  list: [],
  count: 0,
  limit: 0,
  loaded: false,
  isFriend: () => false,
  add: noop,
  remove: noop,
  openProfile: () => {},
})

// the shared friends list
export function useFriends() {
  return useContext(FriendsContext)
}

import type { VoteDir } from '../api/posts'

type Votable = { my_vote: VoteDir; votes_count: number }

// what a vote click turns into: the same direction again clears it
export function applyVote(current: Votable, dir: 1 | -1): Votable {
  const my_vote: VoteDir = current.my_vote === dir ? 0 : dir
  return { my_vote, votes_count: current.votes_count - current.my_vote + my_vote }
}

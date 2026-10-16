import { createContext, useContext } from 'react'

// True for a test account: the blogs can be read but not posted to, replied to or voted on.
// Home provides it; the backend refuses those actions either way.
export const ReadOnlyContext = createContext(false)

export function useReadOnly() {
  return useContext(ReadOnlyContext)
}

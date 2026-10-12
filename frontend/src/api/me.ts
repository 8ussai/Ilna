import { authRequest } from './client'

export type Storage = { used_bytes: number; limit_bytes: number }

export function fetchStorage() {
  return authRequest<Storage>('/me/storage')
}

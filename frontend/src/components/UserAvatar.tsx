import { Blobatar } from '@blobatar/react'

type UserAvatarProps = { username: string; size: number; className?: string }

// Deterministic avatar seeded by the username (usernames never change, so neither does the avatar).
export function UserAvatar({ username, size, className = '' }: UserAvatarProps) {
  return (
    <Blobatar
      name={username}
      size={size}
      background="circle"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 rounded-full ${className}`}
    />
  )
}

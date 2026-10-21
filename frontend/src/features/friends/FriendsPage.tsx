import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { searchUsers } from '../../api/friends'
import type { PublicProfile } from '../../api/friends'
import type { Catalog } from '../../api/meta'
import { FriendButton, ProfileSummary } from './Friends'
import { UserAvatar } from '../../components/UserAvatar'
import { useFriends } from './friendsContext'
import { useReadOnly } from '../../lib/readOnly'

// waits for typing to pause before searching
const SEARCH_DELAY_MS = 300

// one person in search results or the friends list
function PersonRow({ profile, catalog }: { profile: PublicProfile; catalog: Catalog | null }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <UserAvatar username={profile.username} size={40} />
      <ProfileSummary profile={profile} catalog={catalog} />
      <FriendButton profile={profile} />
    </li>
  )
}

// Account menu > Friends: find people by name or @username, and the list of who you've added.
export function FriendsPage({ catalog }: { catalog: Catalog | null }) {
  const { t } = useTranslation()
  const readOnly = useReadOnly()
  const { list, count, limit, loaded } = useFriends()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ query: string; people: PublicProfile[] } | null>(null)
  const [failed, setFailed] = useState(false)

  const trimmed = query.trim()
  useEffect(() => {
    if (!trimmed) return
    let ignore = false
    const timer = setTimeout(() => {
      searchUsers(trimmed)
        .then((people) => {
          if (ignore) return
          setFailed(false)
          setResults({ query: trimmed, people })
        })
        .catch(() => !ignore && setFailed(true))
    }, SEARCH_DELAY_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [trimmed])

  const showing = trimmed && results?.query === trimmed ? results.people : null

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">{t('friends.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('friends.description')}</p>

      <section className="mt-6">
        <label htmlFor={searchId} className="sr-only">
          {t('friends.search')}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('friends.searchPlaceholder')}
          maxLength={60}
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-line bg-card px-3 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {trimmed && (
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-card" aria-live="polite">
            {failed ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t('friends.searchFailed')}</p>
            ) : !showing ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t('feed.loading')}</p>
            ) : showing.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t('friends.noResults')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {showing.map((profile) => (
                  <PersonRow key={profile.id} profile={profile} catalog={catalog} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">{t('friends.yourList')}</h2>
          {!readOnly && loaded && (
            <span className={`text-sm ${count >= limit ? 'text-danger' : 'text-muted'}`}>{t('friends.counter', { count, limit })}</span>
          )}
        </div>
        {!loaded ? (
          <p className="mt-3 text-muted">{t('feed.loading')}</p>
        ) : list.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-card px-4 py-6 text-center text-sm text-muted">
            {readOnly ? t('friends.testAccount') : t('friends.empty')}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {list.map((profile) => (
              <PersonRow key={profile.id} profile={profile} catalog={catalog} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

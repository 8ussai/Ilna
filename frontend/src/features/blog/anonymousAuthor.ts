import type { TFunction } from 'i18next'

import type { Author } from '../../api/posts'

// An anonymous author comes from the backend with blank names (see Author in api/posts.ts).
export function isAnonymousAuthor(author: Author) {
  return author.username === ''
}

// "Author", "Anonymous 2" or plain "Anonymous", in the reader's language
export function anonymousName(t: TFunction, author: Author) {
  if (author.is_thread_author) return t('anonymous.author')
  return author.anon_number != null ? t('anonymous.name', { number: author.anon_number }) : t('anonymous.label')
}

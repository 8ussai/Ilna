import type { ReactNode } from 'react'

import { LINK_PATTERN, namedLinkHref, safeHref, URL_PATTERN } from './links'

// sentence punctuation right after a link isn't part of it ("see https://x.com." or "(https://x.com)")
const TRAILING = /[.,!?;:'"،؛؟]+$/
// links longer than this are shortened on screen; the full address is still what opens
const MAX_SHOWN = 60

// a found address without the punctuation after it
function trimLink(raw: string): string {
  let link = raw.replace(TRAILING, '')
  // a closing bracket belongs to the link only if the link also opened one, like Wikipedia's (disambiguation)
  while (link.endsWith(')') && (link.match(/\(/g)?.length ?? 0) < (link.match(/\)/g)?.length ?? 0)) {
    link = link.slice(0, -1).replace(TRAILING, '')
  }
  return link
}

// how a link is shown: without http(s)://, shortened if long
function shown(link: string): string {
  const bare = link.replace(/^https?:\/\//i, '')
  return bare.length > MAX_SHOWN ? `${bare.slice(0, MAX_SHOWN - 1)}…` : bare
}

// one link that opens in a new tab; hovering shows the full address it really goes to
function Link({ href, children, ltr }: { href: string; children: ReactNode; ltr: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      // the opened page can't reach back into this one, and the link doesn't vouch for the site
      rel="noopener noreferrer nofollow ugc"
      dir={ltr ? 'ltr' : undefined}
      title={href}
      // an address has no spaces to wrap at, so it may break anywhere; a name wraps between words
      className={`${ltr ? 'break-all' : 'break-words'} text-accent underline underline-offset-2 hover:opacity-80`}
    >
      {children}
    </a>
  )
}

// Text with its web addresses and named links ([text](address)) as links that open in a new tab.
// Keeps line breaks (whitespace-pre-wrap on the parent).
export function LinkifiedText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0
    const [whole, name, address] = match

    if (name !== undefined) {
      const href = namedLinkHref(address)
      // a bad address leaves the whole thing as typed
      if (!href) continue
      parts.push(text.slice(last, start))
      // text that looks like an address shows the real one, so a link can't pretend to go elsewhere
      parts.push(
        URL_PATTERN.test(name) ? (
          <Link key={start} href={href} ltr>
            {shown(href)}
          </Link>
        ) : (
          <Link key={start} href={href} ltr={false}>
            {name}
          </Link>
        ),
      )
      last = start + whole.length
      continue
    }

    const link = trimLink(whole)
    const href = safeHref(link)
    if (!href) continue
    parts.push(text.slice(last, start))
    parts.push(
      <Link key={start} href={href} ltr>
        {shown(link)}
      </Link>,
    )
    last = start + link.length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

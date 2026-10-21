import type { ReactNode } from 'react'

// web addresses typed or pasted into posts and replies; there's no other formatting
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi
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

// only http and https become links, so javascript: or data: addresses can never run
function safeHref(link: string): string | null {
  try {
    const url = new URL(link.toLowerCase().startsWith('www.') ? `https://${link}` : link)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

// how a link is shown: without http(s)://, shortened if long
function shown(link: string): string {
  const bare = link.replace(/^https?:\/\//i, '')
  return bare.length > MAX_SHOWN ? `${bare.slice(0, MAX_SHOWN - 1)}…` : bare
}

// Text with its web addresses as links that open in a new tab. Keeps line breaks (whitespace-pre-wrap on the parent).
export function LinkifiedText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    const link = trimLink(match[0])
    const href = safeHref(link)
    if (!href) continue
    parts.push(text.slice(last, start))
    parts.push(
      <a
        key={start}
        href={href}
        target="_blank"
        // the opened page can't reach back into this one, and the link doesn't vouch for the site
        rel="noopener noreferrer nofollow ugc"
        dir="ltr"
        title={href}
        className="break-all text-accent underline underline-offset-2 hover:opacity-80"
      >
        {shown(link)}
      </a>,
    )
    last = start + link.length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

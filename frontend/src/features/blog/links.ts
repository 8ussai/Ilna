// Links in posts, replies and typed notes. Text is stored as typed; a named link is written
// [text to show](web address), which the composer's Link button inserts.

// a named link, or a bare web address; the address in a named link may hold one level of brackets, like Wikipedia's
export const LINK_PATTERN = /\[([^[\]\n]{1,300})\]\(([^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)|\b(?:https?:\/\/|www\.)[^\s<>"]+/gi
// a bare web address anywhere in a piece of text
export const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/i
// a named link, whole or cut off at the end (activity previews are cut to a length)
const NAMED_LINK = /\[([^[\]\n]{1,300})\]\(([^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)/g
const CUT_NAMED_LINK = /\[([^[\]\n]{1,300})\]\([^\s)]*$/

// only http and https become links, so javascript: or data: addresses can never run
export function safeHref(link: string): string | null {
  try {
    const url = new URL(link.toLowerCase().startsWith('www.') ? `https://${link}` : link)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

// A named link's address: "example.com/x" gets https:// in front. Null unless it's http(s) with a
// dotted host, so "[1](see)" style text stays text.
export function namedLinkHref(address: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address) ? address : `https://${address}`
  const href = safeHref(withScheme)
  if (!href) return null
  return new URL(href).hostname.includes('.') ? href : null
}

// what the Link button inserts; brackets and line breaks in the text would break the link, so they go
export function formatNamedLink(text: string, href: string): string {
  const clean = text.replace(/[[\]\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `[${clean || href}](${href})`
}

// the text with named links shown as just their text, for places that show no links
export function plainLinkText(text: string): string {
  return text.replace(NAMED_LINK, '$1').replace(CUT_NAMED_LINK, '$1')
}

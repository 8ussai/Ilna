export const LINK_TITLE_MAX = 200

export type LinkFormHandle = { flush: () => Promise<boolean> }

// the same rule the backend applies, so most mistakes are caught before the request
export function isWebUrl(value: string) {
  return /^https?:\/\/[^\s/]+/i.test(value.trim())
}

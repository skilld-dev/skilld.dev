/**
 * A same-origin relative path, safe to pass to a redirect.
 * Only `parseReturnTo` makes one.
 */
export type SameOriginPath = string & { readonly __brand: 'SameOriginPath' }

const SITE_ORIGIN = 'https://skilld.dev'
const MAX_LENGTH = 2048
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001F\u007F\\]/

/**
 * Parse an untrusted return target once, at the boundary.
 * Accept a path with one leading `/` that stays on the site origin.
 * Otherwise return `fallback`.
 */
export function parseReturnTo(value: unknown, fallback: string = '/me'): SameOriginPath {
  return (isSameOriginPath(value) ? value : fallback) as SameOriginPath
}

function isSameOriginPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_LENGTH)
    return false
  if (!value.startsWith('/') || value.startsWith('//'))
    return false
  if (FORBIDDEN.test(value))
    return false
  if (!URL.canParse(value, SITE_ORIGIN))
    return false
  return new URL(value, SITE_ORIGIN).origin === SITE_ORIGIN
}

/**
 * Same-origin image proxy addresses.
 *
 * A page that loads an image from another host reports the visitor's IP
 * address and the page they read to that host. Every third-party image on
 * skilld.dev loads through `/_img` instead, so only skilld.dev sees visitors.
 *
 * Two kinds of address exist:
 * - `/_img/avatar?url=` serves avatar hosts only, so pages can build it anywhere.
 * - `/_img/signed?url=&sig=` serves any public https image the server signed.
 */

export const IMAGE_PROXY_PREFIX = '/_img'

export type ImageTargetError
  = | 'invalid-url'
    | 'not-https'
    | 'credentials'
    | 'port'
    | 'ip-literal'
    | 'private-host'

export type ImageTarget
  = | { _tag: 'Ok', url: URL }
    | { _tag: 'Err', reason: ImageTargetError }

const PRIVATE_HOST_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home.arpa', 'arpa', 'test', 'invalid', 'example']

/**
 * Parses an untrusted image address into a public https URL.
 * The proxy fetches only what passes, so it cannot reach local networks.
 */
export function parseImageTarget(raw: string): ImageTarget {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    // An address the URL parser rejects is not an image target. The reason is
    // returned to the caller, so nothing is lost.
    return { _tag: 'Err', reason: 'invalid-url' }
  }
  if (url.protocol !== 'https:')
    return { _tag: 'Err', reason: 'not-https' }
  if (url.username || url.password)
    return { _tag: 'Err', reason: 'credentials' }
  if (url.port)
    return { _tag: 'Err', reason: 'port' }
  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  // The URL parser normalises every IPv4 spelling (hex, octal, short forms)
  // to dotted decimal, and wraps IPv6 in brackets.
  if (host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host))
    return { _tag: 'Err', reason: 'ip-literal' }
  if (!host.includes('.') || PRIVATE_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`)))
    return { _tag: 'Err', reason: 'private-host' }
  url.hash = ''
  return { _tag: 'Ok', url }
}

/**
 * Avatar hosts the unsigned proxy serves. The path rules keep the unsigned
 * route from proxying arbitrary content hosted on the same domains.
 */
export function isAvatarUrl(url: URL): boolean {
  switch (url.hostname) {
    case 'avatars.githubusercontent.com':
      return true
    case 'github.com':
      return /^\/[a-z0-9-]+\.png$/i.test(url.pathname)
    case 'pbs.twimg.com':
      return url.pathname.startsWith('/profile_images/')
    case 'cdn.bsky.app':
      return url.pathname.startsWith('/img/avatar/') || url.pathname.startsWith('/img/avatar_thumbnail/')
    default:
      return false
  }
}

/**
 * The proxy address for an avatar. Returns undefined for an address on any
 * other host, so the page shows its fallback and loads nothing third party.
 */
export function avatarProxyUrl(src: string | null | undefined): string | undefined {
  if (!src)
    return undefined
  if (src.startsWith(`${IMAGE_PROXY_PREFIX}/`))
    return src
  const target = parseImageTarget(src)
  if (target._tag === 'Err' || !isAvatarUrl(target.url))
    return undefined
  return `${IMAGE_PROXY_PREFIX}/avatar?url=${encodeURIComponent(target.url.href)}`
}

/** The proxy address for a GitHub account avatar at a pixel size. */
export function githubAvatarProxyUrl(login: string, size: number): string {
  const target = `https://github.com/${encodeURIComponent(login)}.png?size=${size}`
  return `${IMAGE_PROXY_PREFIX}/avatar?url=${encodeURIComponent(target)}`
}

/** The proxy address for an image the server signed. */
export function signedImageProxyUrl(url: URL, signature: string): string {
  return `${IMAGE_PROXY_PREFIX}/signed?url=${encodeURIComponent(url.href)}&sig=${signature}`
}

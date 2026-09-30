const APEX_ORIGIN = 'https://skilld.dev'
const WWW_HOST = 'www.skilld.dev'

/**
 * The absolute apex URL a `www` request belongs on, or null when the request
 * already sits on the canonical host.
 *
 * `path` is the request target: pathname plus query, exactly as `event.path`
 * carries it. It always lands after the fixed apex origin, so a crafted path
 * can never choose the destination host.
 */
export function canonicalHostRedirect(host: string, path: string): string | null {
  const hostname = host.toLowerCase().replace(/:\d+$/, '')
  if (hostname !== WWW_HOST)
    return null

  return `${APEX_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

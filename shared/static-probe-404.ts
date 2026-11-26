/**
 * Identify unrouted static asset and CMS/scanner probe paths that reached Nitro
 * only because Cloudflare Static Assets had no matching file.
 *
 * Answering these with a lightweight plain-text 404 avoids full Nuxt SSR error
 * page rendering (~110 ms CPU per probe) and allows short edge caching because
 * the response is not an HTML document.
 */

const SCANNER_PREFIXES = [
  '/wp-content/',
  '/wp-admin/',
  '/wp-includes/',
  '/wordpress/',
  '/.git/',
  '/phpmyadmin/',
  '/cgi-bin/',
] as const

const SCANNER_EXACT_PATHS = new Set([
  '/wp-login.php',
  '/xmlrpc.php',
  '/.env',
])

const DYNAMIC_PREFIXES = [
  '/_img/',
  '/_og/',
  '/_og-static-fonts/',
  '/__og-image__/',
  '/_nuxt/',
  '/_file-icons/',
  '/_scripts/',
  '/api/',
  '/b/',
  '/demos/',
  '/gh/',
  '/repos/',
  '/skills/',
  '/.well-known/',
] as const

const ALLOWED_STATIC_PATHS = new Set([
  '/_nuxt-skew-sw.js',
])

// Non-document static asset and server-script extensions. Document-like
// extensions (`.md`, `.xml`, `.txt`, `.json`, `.html`, `.svg`, `.sh`, `.ps1`)
// stay out so sitemaps, markdown endpoints, feeds, and install scripts remain
// untouched.
const STATIC_PROBE_EXT_RE = /\.(?:png|jpe?g|gif|ico|webp|avif|bmp|woff2?|ttf|eot|otf|map|php|aspx?|jsp|sql|bak|tar|gz|zip|js|css)$/i

export function isStaticProbe404Path(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  if (ALLOWED_STATIC_PATHS.has(lower))
    return false

  if (SCANNER_EXACT_PATHS.has(lower) || lower.startsWith('/.env.'))
    return true

  if (SCANNER_PREFIXES.some(prefix => lower.startsWith(prefix)))
    return true

  if (DYNAMIC_PREFIXES.some(prefix => lower.startsWith(prefix)))
    return false

  return STATIC_PROBE_EXT_RE.test(lower)
}

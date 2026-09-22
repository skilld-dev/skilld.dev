import type { ImageTargetError } from '#shared/image-proxy'
import { isAvatarUrl, parseImageTarget, signedImageProxyUrl } from '#shared/image-proxy'

/** Largest image the proxy serves. */
export const IMAGE_PROXY_MAX_BYTES = 5 * 1024 * 1024
/** Redirect hops the proxy follows before it gives up. */
export const IMAGE_PROXY_MAX_REDIRECTS = 3

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
])

const UPSTREAM_HEADERS = {
  'accept': 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8',
  'user-agent': 'skilld.dev-image-proxy/1.0 (+https://skilld.dev)',
} as const

/**
 * Stops a proxied SVG from running script or loading anything when a visitor
 * opens its address directly.
 */
export const IMAGE_PROXY_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox'

const SUCCESS_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'
const FAILURE_CACHE_CONTROL = 'public, max-age=300'

export type ImageProxyRequest
  = | { _tag: 'avatar', target: URL }
    | { _tag: 'signed', target: URL, signature: string }

export type ImageProxyFailure
  = | { _tag: 'NotFound', reason: ImageTargetError | 'unknown-route' | 'not-avatar' | 'bad-signature' | 'redirect-limit' | 'upstream-missing' }
    | { _tag: 'UnsupportedType', contentType: string }
    | { _tag: 'TooLarge' }
    | { _tag: 'UpstreamFailed', status: number }

export type ImageProxyResult
  = | { _tag: 'Ok', body: ArrayBuffer, contentType: string }
    | ImageProxyFailure

export type ParsedImageProxyRequest
  = | { _tag: 'Ok', request: ImageProxyRequest }
    | Extract<ImageProxyFailure, { _tag: 'NotFound' }>

/** Parses the route kind and query of a `/_img` request. */
export function parseImageProxyRequest(kind: string | undefined, query: Record<string, unknown>): ParsedImageProxyRequest {
  if (kind !== 'avatar' && kind !== 'signed')
    return { _tag: 'NotFound', reason: 'unknown-route' }
  const target = typeof query.url === 'string' ? parseImageTarget(query.url) : { _tag: 'Err' as const, reason: 'invalid-url' as const }
  if (target._tag === 'Err')
    return { _tag: 'NotFound', reason: target.reason }
  if (kind === 'avatar') {
    if (!isAvatarUrl(target.url))
      return { _tag: 'NotFound', reason: 'not-avatar' }
    return { _tag: 'Ok', request: { _tag: 'avatar', target: target.url } }
  }
  if (typeof query.sig !== 'string' || !/^[\w-]{43}$/.test(query.sig))
    return { _tag: 'NotFound', reason: 'bad-signature' }
  return { _tag: 'Ok', request: { _tag: 'signed', target: target.url, signature: query.sig } }
}

/** Imports the image proxy secret as an HMAC-SHA-256 key. */
export async function importImageProxyKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes))
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Signs a public https image address and returns its same-origin proxy
 * address. Returns null when the address is not a public https URL.
 */
export async function signImageProxyUrl(key: CryptoKey, raw: string): Promise<string | null> {
  const target = parseImageTarget(raw)
  if (target._tag === 'Err')
    return null
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(target.url.href))
  return signedImageProxyUrl(target.url, toBase64Url(signature))
}

/** Checks a signature in constant time. */
export async function verifyImageProxySignature(key: CryptoKey, target: URL, signature: string): Promise<boolean> {
  return await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), new TextEncoder().encode(target.href))
}

function mediaType(header: string | null): string {
  return (header ?? '').split(';')[0]!.trim().toLowerCase()
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<ArrayBuffer | null> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done)
      break
    size += value.byteLength
    if (size > IMAGE_PROXY_MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

/**
 * Fetches a proxied image. Sends no visitor headers upstream, follows at most
 * three redirects, and checks every hop against the same address rules.
 */
export async function fetchProxiedImage(request: ImageProxyRequest, fetcher: typeof fetch): Promise<ImageProxyResult> {
  let target = request.target
  for (let hop = 0; ; hop++) {
    const response = await fetcher(target.href, { headers: UPSTREAM_HEADERS, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || hop >= IMAGE_PROXY_MAX_REDIRECTS)
        return { _tag: 'NotFound', reason: 'redirect-limit' }
      const resolved = URL.parse(location, target)
      if (!resolved)
        return { _tag: 'NotFound', reason: 'invalid-url' }
      const next = parseImageTarget(resolved.href)
      if (next._tag === 'Err')
        return { _tag: 'NotFound', reason: next.reason }
      if (request._tag === 'avatar' && !isAvatarUrl(next.url))
        return { _tag: 'NotFound', reason: 'not-avatar' }
      target = next.url
      continue
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel()
      return { _tag: 'NotFound', reason: 'upstream-missing' }
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return { _tag: 'UpstreamFailed', status: response.status }
    }
    const contentType = mediaType(response.headers.get('content-type'))
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      await response.body.cancel()
      return { _tag: 'UnsupportedType', contentType }
    }
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > IMAGE_PROXY_MAX_BYTES) {
      await response.body.cancel()
      return { _tag: 'TooLarge' }
    }
    const body = await readCapped(response.body)
    if (!body)
      return { _tag: 'TooLarge' }
    return { _tag: 'Ok', body, contentType }
  }
}

const FAILURE_STATUS = {
  NotFound: 404,
  UnsupportedType: 415,
  TooLarge: 413,
  UpstreamFailed: 502,
} as const satisfies Record<ImageProxyFailure['_tag'], number>

/**
 * Builds the response for a proxy result. Upstream headers never pass
 * through, so no upstream cookie reaches the visitor.
 */
export function imageProxyResponse(result: ImageProxyResult): Response {
  const headers = new Headers({
    'content-security-policy': IMAGE_PROXY_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
  })
  if (result._tag === 'Ok') {
    headers.set('content-type', result.contentType)
    headers.set('content-length', String(result.body.byteLength))
    headers.set('cache-control', SUCCESS_CACHE_CONTROL)
    headers.set('cloudflare-cdn-cache-control', SUCCESS_CACHE_CONTROL)
    return new Response(result.body, { status: 200, headers })
  }
  headers.set('content-type', 'text/plain; charset=utf-8')
  const cacheControl = result._tag === 'UpstreamFailed' ? 'no-store' : FAILURE_CACHE_CONTROL
  headers.set('cache-control', cacheControl)
  headers.set('cloudflare-cdn-cache-control', cacheControl)
  return new Response(null, { status: FAILURE_STATUS[result._tag], headers })
}

/**
 * The image proxy signing key, or null when the secret is not set. Without a
 * key, SKILL.md images render as links and signed proxy requests return 404.
 */
export async function resolveImageProxyKey(env: { NUXT_IMAGE_PROXY_KEY?: string } | undefined): Promise<CryptoKey | null> {
  const secret = env?.NUXT_IMAGE_PROXY_KEY?.trim()
  return secret ? await importImageProxyKey(secret) : null
}

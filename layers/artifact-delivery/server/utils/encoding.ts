export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    return `{${entries.join(',')}}`
  }
  throw new TypeError(`Cannot encode ${typeof value} as canonical JSON`)
}

export async function digestHex(algorithm: 'SHA-1' | 'SHA-256', value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest(algorithm, Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = '='.repeat((4 - normalized.length % 4) % 4)
  const binary = atob(normalized + padding)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

/**
 * The SHA-1 Git records for a blob, over `blob <length>\0<bytes>`.
 *
 * This is the only identity shared by the Git tree, the blobs API and a
 * Repository tarball, so it is what lets bytes arrive from an untrusted
 * source and still be checked against what the tree named.
 */
export async function gitBlobShaHex(content: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${content.byteLength}\0`)
  const value = new Uint8Array(header.byteLength + content.byteLength)
  value.set(header)
  value.set(content, header.byteLength)
  return await digestHex('SHA-1', value)
}

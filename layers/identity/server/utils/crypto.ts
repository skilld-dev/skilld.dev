// AES-GCM token encryption. Key supplied via NUXT_TOKEN_KEY (base64, 32 bytes).
// Output format: base64(iv || ciphertext+tag) so decrypt is single-string in.

async function getKey(rawKey: string): Promise<CryptoKey> {
  if (!rawKey)
    throw createError({ statusCode: 500, message: 'NUXT_TOKEN_KEY missing' })
  const bytes = Uint8Array.from(atob(rawKey), c => c.charCodeAt(0))
  if (bytes.length !== 32)
    throw createError({ statusCode: 500, message: 'NUXT_TOKEN_KEY must be 32 bytes (base64)' })
  return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

export async function encryptToken(plaintext: string, rawKey: string): Promise<string> {
  const key = await getKey(rawKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  const out = new Uint8Array(iv.length + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), iv.length)
  return toB64(out)
}

export async function decryptToken(ciphertext: string, rawKey: string): Promise<string> {
  const key = await getKey(rawKey)
  const buf = fromB64(ciphertext)
  const iv = buf.slice(0, 12)
  const ct = buf.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}

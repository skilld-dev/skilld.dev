// Cloudflare Workers `send_email` binding. Configured in nuxt.config.ts as
// `send_email: [{ name: 'EMAIL' }]`; `mail.skilld.dev` must be a verified
// sender domain in the Cloudflare dashboard with DKIM/SPF/DMARC set up.
//
// Each digest recipient must also be a Verified Destination Address in the
// Cloudflare dashboard until the account has Send Email enabled for
// arbitrary destinations. Until then `send()` will fail with an
// "unverified destination" error and the digest_runs row gets status='failed'.
import type { H3Event } from 'h3'
import { createMimeMessage } from 'mimetext'

const FROM_ADDR = 'noreply@mail.skilld.dev'
const FROM_NAME = 'skilld'

interface SendEmailBinding {
  send: (msg: unknown) => Promise<void>
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
}

export interface SendEmailResult {
  ok: boolean
  // The Cloudflare binding doesn't return a provider id; we synthesise one
  // from a per-message UUID so digest_runs.resend_id remains useful.
  messageId?: string
  error?: string
}

export async function sendEmail(event: H3Event, input: SendEmailInput): Promise<SendEmailResult> {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const binding = env?.EMAIL as SendEmailBinding | undefined
  if (!binding) {
    return { ok: false, error: 'EMAIL binding missing (configure send_email in wrangler)' }
  }

  const messageId = `<${crypto.randomUUID()}@mail.skilld.dev>`
  const msg = createMimeMessage()
  msg.setSender({ name: FROM_NAME, addr: FROM_ADDR })
  msg.setRecipient(input.to)
  msg.setSubject(input.subject)
  msg.setHeader('Message-ID', messageId)
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers))
      msg.setHeader(k, v)
  }
  if (input.text)
    msg.addMessage({ contentType: 'text/plain', data: input.text })
  msg.addMessage({ contentType: 'text/html', data: input.html })

  // EmailMessage class lives in `cloudflare:email` (workers built-in).
  // Dynamic import keeps the dev bundle happy when the binding is absent.
  const { EmailMessage } = await import('cloudflare:email') as {
    EmailMessage: new (from: string, to: string, raw: string) => unknown
  }
  const cfMessage = new EmailMessage(FROM_ADDR, input.to, msg.asRaw())

  try {
    await binding.send(cfMessage)
    return { ok: true, messageId }
  }
  catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// HMAC-SHA256 signed unsubscribe token. base64url(payload).base64url(sig).
// Payload = JSON {u: userId, exp: epoch} — exp is far-future for unsub links.

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Uint8Array.from(atob(norm), c => c.charCodeAt(0))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signUnsubToken(userId: number, secret: string): Promise<string> {
  if (!secret)
    throw createError({ statusCode: 500, message: 'NUXT_TOKEN_KEY missing' })
  const payload = b64urlEncode(enc.encode(JSON.stringify({ u: userId, exp: 0 })))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return `${payload}.${b64urlEncode(sig)}`
}

export async function verifyUnsubToken(token: string, secret: string): Promise<number | null> {
  if (!secret || !token.includes('.'))
    return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig)
    return null
  const key = await hmacKey(secret)
  const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(payload))
  if (!valid)
    return null
  const data = JSON.parse(dec.decode(b64urlDecode(payload))) as { u?: number, exp?: number }
  if (typeof data.u !== 'number')
    return null
  return data.u
}

// Email-verification token: random 32-byte secret. We store SHA-256(token)
// in the DB and email the raw token. Lookup by hash; expires after 24h.

export function generateEmailVerifyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return b64urlEncode(bytes)
}

export async function hashEmailVerifyToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token))
  return b64urlEncode(buf)
}

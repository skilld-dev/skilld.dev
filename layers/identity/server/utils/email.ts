// Cloudflare Workers `send_email` binding. Configured in wrangler.jsonc as
// `send_email: [{ name: 'EMAIL' }]`; `mail.skilld.dev` must be a verified
// sender domain in the Cloudflare dashboard with DKIM/SPF/DMARC set up.
//
// Each digest recipient must also be a Verified Destination Address in the
// Cloudflare dashboard until the account has Send Email enabled for
// arbitrary destinations. Until then `send()` will fail with an
// "unverified destination" error and the digest_runs row gets status='failed'.

export interface SendEmailInput {
  to: string
  from?: EmailAddress
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
}

export type SendEmailResult
  = { _tag: 'accepted', messageId: string }
    | { _tag: 'rejected', error: string }
    | { _tag: 'uncertain', error: string }

export function digestEmailHeaders(unsubscribeUrl: string, campaignId: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Campaign-ID': campaignId,
  }
}

export async function sendEmailWithEnv(
  env: Pick<Cloudflare.Env, 'EMAIL'> | undefined,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const binding = env?.EMAIL

  if (!binding) {
    return {
      _tag: 'rejected',
      error: 'EMAIL binding missing (configure send_email in wrangler)',
    }
  }

  const from = input.from ?? useRuntimeConfig().email.from
  const outcome = await binding.send({
    to: input.to,
    from,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: input.headers,
  }).then(
    result => ({ _tag: 'response' as const, result: result as unknown }),
    error => ({
      _tag: 'failure' as const,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  if (outcome._tag === 'failure') {
    return {
      _tag: 'rejected',
      error: outcome.error,
    }
  }
  const messageId = parseProviderMessageId(outcome.result)
  if (!messageId) {
    return {
      _tag: 'uncertain',
      error: 'Email provider returned success without a nonempty message ID',
    }
  }
  return {
    _tag: 'accepted',
    messageId,
  }
}

function parseProviderMessageId(value: unknown): string | null {
  if (typeof value !== 'object'
    || value === null
    || !('messageId' in value)
    || typeof value.messageId !== 'string') {
    return null
  }
  const messageId = value.messageId.trim()
  return messageId || null
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const event = useEvent()
  return await sendEmailWithEnv(event.context.platform?.env, input)
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

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(norm)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
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

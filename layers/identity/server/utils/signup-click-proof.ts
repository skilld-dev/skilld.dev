import type { H3Event } from 'h3'
import { getHeader, getRequestURL, setHeader, useSession } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

const PROOF_SECONDS = 300

interface ClickProof {
  nonce: string
  page: string
  client: string
  expiresAt: number
}

function browserPage(event: H3Event): string | null {
  const referer = getHeader(event, 'referer')
  if (!referer || !URL.canParse(referer))
    return null
  const page = new URL(referer)
  const request = getRequestURL(event)
  const origin = getHeader(event, 'origin')
  if (page.origin !== request.origin || (origin && origin !== request.origin))
    return null
  return `${page.pathname}${page.search}`
}

function clientKey(event: H3Event): string {
  // Cloudflare owns this header. Never trust X-Forwarded-For.
  return getHeader(event, 'cf-connecting-ip') ?? 'unknown'
}

function proofSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  return useSession<ClickProof>(event, {
    name: 'skilld-signup-click',
    password: process.env.NUXT_SESSION_PASSWORD || config.session.password,
    maxAge: PROOF_SECONDS,
    cookie: { httpOnly: true, sameSite: 'strict', secure: !import.meta.dev, path: '/' },
  })
}

async function withinAllowance(event: H3Event): Promise<boolean> {
  const result = await event.context.platform.env.API_GUEST_RATE_LIMIT.limit({ key: `signup-click:${clientKey(event)}` })
  return result.success
}

export async function issueSignupClickProof(event: H3Event): Promise<string | null> {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'cloudflare-cdn-cache-control', 'no-store')
  const page = browserPage(event)
  if (!page || !await withinAllowance(event))
    return null
  const nonce = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + PROOF_SECONDS
  const session = await proofSession(event)
  const db = event.context.platform.db
  await db.batch([
    db.prepare('DELETE FROM signup_click_proofs WHERE expires_at <= ?1').bind(now),
    db.prepare('INSERT INTO signup_click_proofs (nonce, expires_at) VALUES (?1, ?2)').bind(nonce, expiresAt),
  ])
  await session.update({ nonce, page, client: clientKey(event), expiresAt })
  return nonce
}

export async function consumeSignupClickProof(event: H3Event): Promise<boolean> {
  const nonce = getHeader(event, 'x-signup-proof')
  const page = browserPage(event)
  if (!nonce || !page)
    return false
  const session = await proofSession(event)
  const proof = session.data
  const now = Math.floor(Date.now() / 1000)
  if (proof.nonce !== nonce || proof.page !== page || proof.client !== clientKey(event) || !proof.expiresAt || proof.expiresAt <= now)
    return false
  if (!await withinAllowance(event))
    return false
  // Deleting atomically also rejects a replay of an older sealed cookie.
  const row = await event.context.platform.db.prepare(
    'DELETE FROM signup_click_proofs WHERE nonce = ?1 AND expires_at > ?2 RETURNING nonce',
  ).bind(nonce, now).first<{ nonce: string }>()
  return row !== null
}

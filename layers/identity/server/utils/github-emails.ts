import { z } from 'zod'

const githubEmailsSchema = z.array(z.object({
  email: z.string().min(1),
  primary: z.boolean(),
  verified: z.boolean(),
}).passthrough())

/**
 * The address GitHub marks primary and verified, or null.
 *
 * `/user` leaves `email` empty when the profile email is private, even with
 * the `user:email` scope granted. `/user/emails` still lists it. An unverified
 * primary is rejected: it proves nothing about who owns the inbox.
 */
export function pickVerifiedPrimaryEmail(payload: unknown): string | null {
  const parsed = githubEmailsSchema.safeParse(payload)
  if (!parsed.success)
    return null
  return parsed.data.find(entry => entry.primary && entry.verified)?.email ?? null
}

/**
 * Reads the verified primary address for the token's user.
 *
 * Rejects when GitHub refuses or is unreachable, so the caller decides how a
 * failed lookup affects sign-in. The error names the status, never the token.
 */
export async function fetchVerifiedPrimaryEmail(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetcher('https://api.github.com/user/emails', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skilld.dev',
    },
  })
  if (!res.ok)
    throw new Error(`GitHub /user/emails responded ${res.status}`)
  return pickVerifiedPrimaryEmail(await res.json())
}

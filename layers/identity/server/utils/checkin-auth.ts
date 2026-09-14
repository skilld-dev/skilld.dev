import { createHash, timingSafeEqual } from 'node:crypto'

// Check-in bearer gate mirrors the admin gate: compare SHA-256 digests with
// timingSafeEqual so the endpoint does not leak the token through timing.
export function isValidCheckinAuthorization(authorization: string | undefined, secret: unknown): boolean {
  if (!authorization?.startsWith('Bearer ') || typeof secret !== 'string' || !secret)
    return false
  const provided = createHash('sha256').update(authorization.slice(7)).digest()
  const expected = createHash('sha256').update(secret).digest()
  return timingSafeEqual(provided, expected)
}

import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { verifyAccessToken } from './cli-tokens'
import { getUserById } from './users'

export interface BearerUserContext {
  [key: string]: unknown
  id: number
  githubId?: number
  login: string
  name: string | null
  avatar: string | null
  scopes: string[]
  cliTokenId: number
}

export async function resolveBearerSession(event: H3Event): Promise<BearerUserContext | null> {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer '))
    return null

  const verified = await verifyAccessToken(event, auth.slice(7))
  if (!verified)
    return null

  const user = await getUserById(event, verified.userId)
  if (!user)
    return null

  const resolved = {
    id: user.id,
    githubId: user.github_id,
    login: user.login,
    name: user.name,
    avatar: user.avatar,
    scopes: verified.scopes.split(' ').filter(Boolean),
    cliTokenId: verified.tokenId,
  }

  event.context.user = resolved
  event.context.cliTokenId = verified.tokenId
  return resolved
}

import { z } from 'zod'

const name = z.string().regex(/^[\w.-]+$/).max(100)
const repository = z.object({ id: z.number().int().positive(), name, private: z.boolean(), owner: z.object({ login: name }) })
const installation = z.object({ id: z.number().int().positive() })
const tag = z.string().min(1).max(200).refine(value => [...value].every(char => char.charCodeAt(0) > 32))
export interface TagRequest { owner: string, name: string, repositoryId: number, installationId: number, tag: string }

export function parseGithubEvent(event: string, payload: unknown): { _tag: 'Tags', tags: TagRequest[] } | { _tag: 'Ignored' } | { _tag: 'Invalid' } {
  if (event === 'create') {
    const parsed = z.object({ ref_type: z.enum(['branch', 'tag']), ref: tag, repository, installation }).safeParse(payload)
    if (!parsed.success)
      return { _tag: 'Invalid' }
    const data = parsed.data
    if (data.ref_type !== 'tag' || data.repository.private)
      return { _tag: 'Ignored' }
    return { _tag: 'Tags', tags: [{ owner: data.repository.owner.login, name: data.repository.name, repositoryId: data.repository.id, installationId: data.installation.id, tag: data.ref }] }
  }
  if (event === 'installation' || event === 'installation_repositories') {
    const parsed = z.object({ action: z.string(), installation, repositories: z.array(repository).optional(), repositories_added: z.array(repository).optional() }).safeParse(payload)
    if (!parsed.success)
      return { _tag: 'Invalid' }
    if (!['created', 'added'].includes(parsed.data.action))
      return { _tag: 'Ignored' }
    return { _tag: 'Tags', tags: (parsed.data.repositories_added ?? parsed.data.repositories ?? []).filter(repo => !repo.private).map(repo => ({ owner: repo.owner.login, name: repo.name, repositoryId: repo.id, installationId: parsed.data.installation.id, tag: '@latest' })) }
  }
  return { _tag: 'Ignored' }
}

export async function verifyGithubSignature(secret: string, body: Uint8Array, signature: string | null): Promise<boolean> {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false
  const supplied = Uint8Array.from(signature.slice(7).match(/../g)!, pair => Number.parseInt(pair, 16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, supplied, body)
}

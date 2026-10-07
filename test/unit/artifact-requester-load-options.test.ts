import type { ResolvedSource } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { PublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import { describe, expect, it, vi } from 'vitest'
import { withRequesterFallback } from '../../layers/artifact-delivery/server/utils/requester-github'

const source: ResolvedSource = {
  provider: 'github',
  repositoryId: 1,
  owner: 'thvroyal',
  repository: 'kimi-skills',
  visibility: 'public',
  commitSha: '0'.repeat(40),
  treeSha: '1'.repeat(40),
  skillPath: 'skills/kimi-xlsx',
}

describe('the requester fallback', () => {
  it('passes the linked files choice to both GitHub clients', async () => {
    const limited = { _tag: 'rejected' as const, code: 'RATE_LIMITED' as const, summary: 'spent', findings: [] }
    const shared = { resolve: vi.fn(), load: vi.fn(async () => limited) } as unknown as PublicGithubSourceClient
    const own = { resolve: vi.fn(), load: vi.fn(async () => limited) } as unknown as PublicGithubSourceClient

    await withRequesterFallback(shared, async () => own).load(source, { linkedFiles: true })

    expect(shared.load).toHaveBeenCalledWith(source, { linkedFiles: true })
    expect(own.load).toHaveBeenCalledWith(source, { linkedFiles: true })
  })
})

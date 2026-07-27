import { describe, expect, it, vi } from 'vitest'
import {
  resolveRepoSourceIdentitiesForOwner,
  resolveRepoSourceIdentity,
} from '../../layers/registry/server/utils/repo-source-identity'

describe('repository source identity', () => {
  it('uses the stored canonical identity for live source fetches', async () => {
    const first = vi.fn().mockResolvedValue({
      source_owner: 'openclaw',
      source_repo: 'openclaw',
    })
    const db = database({ first })

    await expect(resolveRepoSourceIdentity(db, {
      owner: 'steipete',
      repo: 'clawdis',
    })).resolves.toEqual({
      owner: 'openclaw',
      repo: 'openclaw',
    })
  })

  it('falls back atomically when canonical identity is absent or incomplete', async () => {
    const first = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ source_owner: 'openclaw', source_repo: null })
    const db = database({ first })

    await expect(resolveRepoSourceIdentity(db, {
      owner: 'acme',
      repo: 'skills',
    })).resolves.toEqual({ owner: 'acme', repo: 'skills' })
    await expect(resolveRepoSourceIdentity(db, {
      owner: 'steipete',
      repo: 'clawdis',
    })).resolves.toEqual({ owner: 'steipete', repo: 'clawdis' })
  })

  it('loads canonical identities for an owner in one bounded query', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        { repo: 'one', source_owner: 'new-acme', source_repo: 'renamed-one' },
        { repo: 'two', source_owner: null, source_repo: null },
      ],
    })
    const db = database({ all })

    const identities = await resolveRepoSourceIdentitiesForOwner(db, 'acme')

    expect(identities.get('one')).toEqual({ owner: 'new-acme', repo: 'renamed-one' })
    expect(identities.get('two')).toEqual({ owner: 'acme', repo: 'two' })
    expect(all).toHaveBeenCalledOnce()
  })
})

function database(methods: {
  first?: ReturnType<typeof vi.fn>
  all?: ReturnType<typeof vi.fn>
}): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: methods.first,
        all: methods.all,
      })),
    })),
  } as unknown as D1Database
}

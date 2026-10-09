import { afterEach, describe, expect, it, vi } from 'vitest'
import { listRepositoryPurposeCandidates } from '../../layers/registry/server/utils/repository-purpose-effect'
import job from '../../server/jobs/registry/repository-purpose'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.hoisted(() => vi.stubGlobal('defineJob', <T>(definition: T) => definition))

describe('repository purpose job', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ends a missing source on its first attempt without calling AI', async () => {
    const sqlite = createSqliteD1(allMigrations())
    const fail = vi.fn()
    const run = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { repository: null } })))
    try {
      sqlite.raw.exec('INSERT INTO repos(owner,repo,repo_skill_count) VALUES (\'org\',\'gone\',3)')
      const ctx = { db: sqlite.db, env: { AI: { run } }, fail } as unknown as Parameters<typeof job.handle>[1]
      await job.handle({ owner: 'org', repo: 'gone' }, ctx)
      expect(fail).toHaveBeenCalledExactlyOnceWith('repo fetch 404')
      expect(run).not.toHaveBeenCalled()
      expect(await listRepositoryPurposeCandidates(sqlite.db, Math.floor(Date.now() / 1000) + 2 * 86400)).toEqual([])
    }
    finally { sqlite.close() }
  })

  it('leaves temporary source failures retryable without quarantining the source', async () => {
    const sqlite = createSqliteD1(allMigrations())
    const fail = vi.fn()
    const run = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unavailable', { status: 503 })))
    try {
      sqlite.raw.exec('INSERT INTO repos(owner,repo,repo_skill_count) VALUES (\'org\',\'busy\',3)')
      const ctx = { db: sqlite.db, env: { AI: { run } }, fail } as unknown as Parameters<typeof job.handle>[1]
      await expect(job.handle({ owner: 'org', repo: 'busy' }, ctx)).rejects.toThrow('Repository purpose source unavailable: 503')
      expect(fail).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
      expect(sqlite.raw.prepare('SELECT broken_since FROM repos').get()).toEqual({ broken_since: null })
      expect(await listRepositoryPurposeCandidates(sqlite.db, 200000)).toEqual([{ owner: 'org', repo: 'busy' }])
    }
    finally { sqlite.close() }
  })
})

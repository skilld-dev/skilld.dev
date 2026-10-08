import { describe, expect, it, vi } from 'vitest'
import { classifyRepositoryPurpose, REPOSITORY_PURPOSE_REFRESH_SECONDS } from '../../layers/registry/server/utils/repository-purpose'
import { checkRepositoryPurposeAdmission, listRepositoryPurposeCandidates, persistRepositoryPurpose, refreshRepositoryPurpose } from '../../layers/registry/server/utils/repository-purpose-effect'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const sourceCommit = 'a'.repeat(40)
const evidence = { owner: 'org', repo: 'directory', sourceCommit, description: 'A directory of software resources', readme: { path: 'README.md', content: 'Links to tools.' }, treeComplete: true, fileCount: 50, skillCount: 3, paths: ['README.md'], skills: [] }
function judge() {
  return Promise.resolve({ model: 'jev-1.13.0', answers: { purpose: {
    type: 'choice',
    choice: 'directory',
    confidence: 0.99,
    probabilities: { 'directory': 0.99, 'uncertain': 0.01, 'software': 0, 'skill-pack': 0, 'mirror': 0 },
  } } })
}

describe('purpose records', () => {
  it('checks large inventories first and avoids active or recently failed jobs', async () => {
    const sqlite = createSqliteD1(allMigrations())
    try {
      sqlite.raw.exec(`
        INSERT INTO repos(owner,repo,repo_skill_count) VALUES ('org','small',3),('org','large',400),('org','busy',200);
        INSERT INTO jobs(id,queue,job_type,payload,available_at,failed_at)
          VALUES ('busy','repo-review-sync','registry/repository-purpose','{"owner":"org","repo":"busy"}',0,NULL);
      `)
      expect(await listRepositoryPurposeCandidates(sqlite.db, 100000))
        .toEqual([{ owner: 'org', repo: 'large' }, { owner: 'org', repo: 'small' }])
      sqlite.raw.exec('UPDATE jobs SET failed_at=99999 WHERE id=\'busy\'')
      expect(await listRepositoryPurposeCandidates(sqlite.db, 100000))
        .toEqual([{ owner: 'org', repo: 'large' }, { owner: 'org', repo: 'small' }])
      sqlite.raw.exec('UPDATE jobs SET failed_at=1 WHERE id=\'busy\'')
      expect(await listRepositoryPurposeCandidates(sqlite.db, 100000))
        .toEqual([{ owner: 'org', repo: 'busy' }, { owner: 'org', repo: 'large' }, { owner: 'org', repo: 'small' }])
    }
    finally { sqlite.close() }
  })

  it('records organization evidence and reuses it only at the same source and prompt', async () => {
    const sqlite = createSqliteD1(allMigrations())
    const judgeMock = vi.fn(judge)
    const deps = { db: sqlite.db, readEvidence: async () => evidence, judge: judgeMock }
    try {
      const first = await refreshRepositoryPurpose(deps, evidence, 1000)
      expect(await refreshRepositoryPurpose(deps, evidence, 1001)).toEqual(first)
      expect(judgeMock).toHaveBeenCalledTimes(1)
      expect(sqlite.raw.prepare('SELECT source_commit,model,prompt_version,evidence FROM repository_purpose').get())
        .toMatchObject({ source_commit: sourceCommit, model: 'jev-1.13.0', evidence: JSON.stringify(evidence) })

      await refreshRepositoryPurpose({ ...deps, readEvidence: async () => ({ ...evidence, sourceCommit: 'b'.repeat(40) }) }, evidence, 1002)
      expect(judgeMock).toHaveBeenCalledTimes(2)
      sqlite.raw.exec('UPDATE repository_purpose SET prompt_version=\'old\'')
      await refreshRepositoryPurpose(deps, evidence, 1003)
      expect(judgeMock).toHaveBeenCalledTimes(3)
      await refreshRepositoryPurpose(deps, evidence, 1003 + REPOSITORY_PURPOSE_REFRESH_SECONDS)
      expect(judgeMock).toHaveBeenCalledTimes(4)
    }
    finally { sqlite.close() }
  })

  it('keeps a newer finding when an older invocation finishes late', async () => {
    const sqlite = createSqliteD1(allMigrations())
    try {
      const result = await classifyRepositoryPurpose(evidence, judge)
      if (result._tag !== 'classified')
        throw new Error('Unexpected invalid fixture')
      await persistRepositoryPurpose(sqlite.db, result, 2000)
      await persistRepositoryPurpose(sqlite.db, { ...result, sourceCommit: 'b'.repeat(40) }, 1000)
      expect(sqlite.raw.prepare('SELECT source_commit FROM repository_purpose').get())
        .toMatchObject({ source_commit: sourceCommit })
    }
    finally { sqlite.close() }
  })

  it('holds a new directory but permits an existing Skill to recover without calling the model', async () => {
    const sqlite = createSqliteD1(allMigrations())
    const deps = { db: sqlite.db, readEvidence: async () => evidence, judge }
    const classify = vi.fn(() => refreshRepositoryPurpose(deps, evidence, 1000))
    try {
      expect(await checkRepositoryPurposeAdmission(sqlite.db, { ...evidence, ownerVerified: false }, classify))
        .toEqual({ _tag: 'held', reason: 'repository_purpose_review_required' })
      sqlite.raw.prepare('INSERT INTO skills(owner,repo,name,slug,display_name) VALUES (\'org\',\'directory\',\'review\',\'org/review\',\'Review\')').run()
      expect(await checkRepositoryPurposeAdmission(sqlite.db, { ...evidence, ownerVerified: false }, classify))
        .toEqual({ _tag: 'continue' })
      expect(classify).toHaveBeenCalledTimes(1)
    }
    finally { sqlite.close() }
  })

  it('retains a named human admission without replacing its decision', async () => {
    const sqlite = createSqliteD1(allMigrations())
    const classify = vi.fn()
    try {
      sqlite.raw.prepare('INSERT INTO skill_repo_eligibility(owner,repo,status,reason,reviewed_by) VALUES (\'org\',\'directory\',\'eligible\',\'Original maintained Skills\',\'human\')').run()
      expect(await checkRepositoryPurposeAdmission(sqlite.db, { ...evidence, ownerVerified: false }, classify))
        .toEqual({ _tag: 'continue' })
      expect(classify).not.toHaveBeenCalled()
      expect(sqlite.raw.prepare('SELECT reason,reviewed_by FROM skill_repo_eligibility WHERE owner=\'org\' AND repo=\'directory\'').get())
        .toMatchObject({ reason: 'Original maintained Skills', reviewed_by: 'human' })
    }
    finally { sqlite.close() }
  })
})

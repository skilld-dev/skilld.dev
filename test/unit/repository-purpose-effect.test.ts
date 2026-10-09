import type { SqliteD1 } from './helpers/d1-sqlite'
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
  it.each([404, 410] as const)('quarantines a missing source (%s) and stops scheduling its purpose', async (status) => {
    const sqlite = createSqliteD1(allMigrations())
    const missing = { _tag: 'source_missing' as const, status }
    const judgeMock = vi.fn(judge)
    try {
      sqlite.raw.exec(`
        INSERT INTO repos(owner,repo,repo_skill_count) VALUES ('org','directory',3);
        INSERT INTO skills(owner,repo,name,slug,display_name) VALUES
          ('org','directory','review','org/review','Review'),
          ('org','directory','gone','org/gone','Gone');
        UPDATE skills SET sync_status='path_missing' WHERE name='gone';
      `)
      expect(await refreshRepositoryPurpose({ db: sqlite.db, readEvidence: async () => missing, judge: judgeMock }, evidence, 1000)).toEqual(missing)
      expect(judgeMock).not.toHaveBeenCalled()
      expect(sqlite.raw.prepare('SELECT broken_since FROM repos').get()).toEqual({ broken_since: 1000 })
      expect(sqlite.raw.prepare('SELECT sync_status,source_resolved,seo_indexable FROM skills WHERE name=\'review\'').get())
        .toEqual({ sync_status: 'repo_missing', source_resolved: 0, seo_indexable: 0 })
      expect(sqlite.raw.prepare('SELECT sync_status FROM skills WHERE name=\'gone\'').get()).toEqual({ sync_status: 'path_missing' })
      expect(await listRepositoryPurposeCandidates(sqlite.db, 200000)).toEqual([])
    }
    finally { sqlite.close() }
  })

  it('returns a terminal admission rejection for a missing new source', async () => {
    const sqlite = createSqliteD1(allMigrations())
    try {
      expect(await checkRepositoryPurposeAdmission(sqlite.db, { ...evidence, ownerVerified: false }, async () => ({ _tag: 'source_missing', status: 404 })))
        .toEqual({ _tag: 'held', reason: 'repo fetch 404' })
    }
    finally { sqlite.close() }
  })

  it.each(['official', 'trusted-author', 'trusted-curator'])('retains a named %s decision for an organization', async (tier) => {
    const sqlite = createSqliteD1(allMigrations())
    const classify = vi.fn()
    try {
      sqlite.raw.prepare(`INSERT INTO repo_trust_overrides(owner,repo,tier,source,reason,reviewed_by,reviewed_at)
        VALUES ('org','directory',?,'manual','Reviewed original Skills within this directory','human',1000)`).run(tier)
      expect(await checkRepositoryPurposeAdmission(sqlite.db, { ...evidence, ownerVerified: false }, classify))
        .toEqual({ _tag: 'continue' })
      expect(classify).not.toHaveBeenCalled()
    }
    finally { sqlite.close() }
  })

  it.each([
    ['candidate', 'human', 'Reviewed source'],
    ['untrusted', 'human', 'Reviewed source'],
    ['quarantined', 'human', 'Reviewed source'],
    ['trusted-curator', ' ', 'Reviewed source'],
    ['trusted-curator', 'human', ' '],
  ])('keeps %s decisions with reviewer %s and reason %s held', async (tier, reviewer, reason) => {
    const sqlite = createSqliteD1(allMigrations())
    const classify = vi.fn(async () => {
      const finding = await classifyRepositoryPurpose(evidence, judge)
      if (finding._tag !== 'classified')
        throw new Error('Unexpected invalid fixture')
      return finding
    })
    try {
      sqlite.raw.prepare(`INSERT INTO repo_trust_overrides(owner,repo,tier,source,reason,reviewed_by,reviewed_at)
        VALUES ('org','directory',?,'manual',?,?,1000)`).run(tier, reason, reviewer)
      expect(await checkRepositoryPurposeAdmission(sqlite.db, { ...evidence, ownerVerified: false }, classify))
        .toEqual({ _tag: 'held', reason: 'repository_purpose_review_required' })
      expect(classify).toHaveBeenCalledTimes(1)
    }
    finally { sqlite.close() }
  })

  /**
   * The runtime holds active jobs in `jobs` and moves terminal failures to
   * `failed_jobs`, deleting them from `jobs`. A dead-lettered classification
   * leaves no `jobs` row at all, so the one day retry wait has to read
   * `failed_jobs` or it never applies to a real failure.
   */
  it('checks large inventories first and avoids active or recently failed jobs', async () => {
    const sqlite = createSqliteD1(allMigrations())
    try {
      sqlite.raw.exec(`
        INSERT INTO repos(owner,repo,repo_skill_count) VALUES ('org','small',3),('org','large',400),('org','busy',200),('org','retry',100);
        INSERT INTO jobs(id,queue,job_type,payload,available_at)
          VALUES ('busy','repo-review-sync','registry/repository-purpose','{"owner":"org","repo":"busy"}',0);
        INSERT INTO failed_jobs(id,queue,job_type,payload,exception,attempts,max_attempts,failed_at)
          VALUES ('retry','repo-review-sync','registry/repository-purpose','{"owner":"org","repo":"retry"}','AI binding unavailable',5,5,99999);
      `)
      expect(await listRepositoryPurposeCandidates(sqlite.db, 100000))
        .toEqual([{ owner: 'org', repo: 'large' }, { owner: 'org', repo: 'small' }])
      sqlite.raw.exec('UPDATE failed_jobs SET failed_at=1 WHERE id=\'retry\'')
      expect(await listRepositoryPurposeCandidates(sqlite.db, 100000))
        .toEqual([{ owner: 'org', repo: 'large' }, { owner: 'org', repo: 'retry' }, { owner: 'org', repo: 'small' }])
    }
    finally { sqlite.close() }
  })

  /**
   * Completed classification jobs stay in `jobs` forever, so a candidate read
   * that ranges over that table walks every finished job for every outer row.
   * Blocking reads must reach `jobs` only through the partial active index and
   * `failed_jobs` only through the failed_at window.
   */
  it('never ranges over retained job history when blocking candidates', async () => {
    const sqlite = createSqliteD1(allMigrations())
    try {
      sqlite.raw.exec(`
        INSERT INTO repos(owner,repo,repo_skill_count) VALUES ('org','small',3);
        INSERT INTO jobs(id,queue,job_type,payload,available_at,completed_at) VALUES
          ('done-1','repo-review-sync','registry/repository-purpose','{"owner":"other","repo":"past"}',0,5000),
          ('done-2','repo-review-sync','registry/repository-purpose','{"owner":"other","repo":"older"}',0,4000);
      `)
      const { db, statements } = recordingDb(sqlite)
      await listRepositoryPurposeCandidates(db, 100000)
      expect(statements.length).toBeGreaterThan(0)
      const details = statements.flatMap(({ sql, values }) => planDetails(sqlite, sql, values))
      const text = details.join('\n')
      expect(text).not.toContain('idx_jobs_type')
      expect(details.some(detail => detail.includes('idx_jobs_active'))).toBe(true)
      expect(details.some(detail => detail.includes('idx_failed_jobs_failed_at'))).toBe(true)
      expect(details.filter(detail => /^SCAN jobs(?! USING)/.test(detail))).toEqual([])
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

/** Wraps the D1 facade so every bound statement can be explained after the call. */
function recordingDb(sqlite: SqliteD1): { db: D1Database, statements: Array<{ sql: string, values: unknown[] }> } {
  const statements: Array<{ sql: string, values: unknown[] }> = []
  const prepare = sqlite.db.prepare.bind(sqlite.db)
  const db = {
    prepare(sql: string) {
      const statement = prepare(sql)
      return {
        ...statement,
        bind: (...values: unknown[]) => {
          statements.push({ sql, values })
          return statement.bind(...values)
        },
      }
    },
  } as unknown as D1Database
  return { db, statements }
}

function planDetails(sqlite: SqliteD1, sql: string, values: unknown[]): string[] {
  const expanded: unknown[] = []
  const normalized = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(values[Number(raw) - 1])
    return '?'
  })
  return (sqlite.raw.prepare(`EXPLAIN QUERY PLAN ${normalized}`).all(...expanded) as Array<{ detail: string }>)
    .map(row => row.detail)
}

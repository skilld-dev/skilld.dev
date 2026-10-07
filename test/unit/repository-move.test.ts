import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pruneOrphanEmbeddings } from '../../layers/registry/server/utils/embedding-parity'
import { moveRepository, repositoryMoveSql } from '../../layers/registry/server/utils/repository-move'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'
import { vectorIdFor } from '../../layers/registry/server/utils/vector-id'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const github = vi.hoisted(() => ({
  getBlobsBatch: vi.fn(),
  getCommitsBatch: vi.fn(),
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  logRateLimit: vi.fn(),
}))

vi.mock('../../layers/registry/server/utils/github-client', () => github)

const REACT_ID = 10270250
const NOW = 1_790_000_000

let d1: SqliteD1

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW * 1000)
  vi.clearAllMocks()
  d1 = createSqliteD1(allMigrations())
})

afterEach(() => {
  vi.useRealTimers()
  d1.close()
})

/** GitHub's answer for a Repository whose head tree the registry already read. */
function githubAnswer(fullName: string, repositoryId: number, headTreeSha = 'tree-1') {
  const [owner, name] = fullName.split('/') as [string, string]
  return {
    status: 200,
    data: {
      repositoryId,
      headTreeSha,
      meta: {
        name,
        full_name: fullName,
        html_url: `https://github.com/${fullName}`,
        owner: { login: owner },
        default_branch: 'main',
        description: 'The library for web and native user interfaces.',
        stargazers_count: 240_000,
        forks_count: 50_000,
        pushed_at: '2026-10-01T00:00:00Z',
        created_at: '2013-05-24T16:15:54Z',
      },
    },
    rateLimit: null,
    notModified: false,
  }
}

function exec(sql: string): void {
  d1.raw.exec(sql)
}

function rows<T>(sql: string): T[] {
  return d1.raw.prepare(sql).all() as T[]
}

function seedUser(id: number): void {
  exec(`INSERT INTO users (id, github_id, login, created_at, last_login_at) VALUES (${id}, ${id}, 'user-${id}', 1, 1)`)
}

function seedRepo(owner: string, repo: string, extra: { source?: string, tree?: string } = {}): void {
  const [sourceOwner, sourceRepo] = extra.source?.split('/') ?? [null, null]
  exec(`
    INSERT INTO repos (owner, repo, default_branch, stars, last_tree_sha, pushed_at, repo_meta_synced_at, repo_skill_count, source_owner, source_repo)
    VALUES ('${owner}', '${repo}', 'main', 10, '${extra.tree ?? 'tree-1'}', ${NOW - 100}, ${NOW - 100}, 2,
      ${sourceOwner ? `'${sourceOwner}'` : 'NULL'}, ${sourceRepo ? `'${sourceRepo}'` : 'NULL'})`)
}

function seedSkill(owner: string, repo: string, name: string, path = `skills/${name}/SKILL.md`): void {
  exec(`
    INSERT INTO skills (owner, repo, name, display_name, slug, description, current_sha, source_resolved,
      rendered_skill_path, rendered_status, rendered_raw, seo_indexable)
    VALUES ('${owner}', '${repo}', '${name}', '${name}', '${owner}/${name}', 'Does ${name}.', 'sha-${name}', 1,
      '${path}', 'ok', '# ${name}', 1)`)
}

describe('sync follows a moved Repository by its ID', () => {
  beforeEach(() => {
    seedUser(101)
    seedRepo('facebook', 'react', { source: 'react/react' })
    seedSkill('facebook', 'react', 'fix')
    seedSkill('facebook', 'react', 'verify')
    exec(`
      INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (101, 'facebook', 'react', 'fix', 1);
      INSERT INTO skill_revisions (owner, repo, name, sha, modified_at) VALUES ('facebook', 'react', 'fix', 'commit-1', 1);
      INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at)
        VALUES ('facebook', 'react', 'fix', 'embedding', 'sha-fix', '{}', '2026-10-01'),
               ('facebook', 'react', 'fix', 'faq', 'sha-fix', '[]', '2026-10-01');
      INSERT INTO repo_star_observations (owner, repo, observed_day, stars) VALUES ('facebook', 'react', ${86400 * 20000}, 10);
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (101, 'facebook', 'react', 'manual', 1);
    `)
    github.getRepoSummary.mockResolvedValue(githubAnswer('react/react', REACT_ID))
  })

  it('moves the Repository and its Skills to the new name and keeps going there', async () => {
    const stats = await syncRepo('facebook', 'react', {}, d1.db)

    expect(github.getRepoSummary).toHaveBeenCalledWith('react', 'react', {})
    expect(stats.movedTo).toEqual({ owner: 'react', repo: 'react' })
    expect(stats.status).toBe('skipped-tree-sha')
    expect(rows(`SELECT owner, repo, repository_id, source_owner, source_repo, stars, last_tree_sha FROM repos`)).toEqual([
      { owner: 'react', repo: 'react', repository_id: REACT_ID, source_owner: 'react', source_repo: 'react', stars: 240_000, last_tree_sha: 'tree-1' },
    ])
    expect(rows(`SELECT owner, repo, name, slug FROM skills ORDER BY name`)).toEqual([
      { owner: 'react', repo: 'react', name: 'fix', slug: 'react/fix' },
      { owner: 'react', repo: 'react', name: 'verify', slug: 'react/verify' },
    ])
    expect(rows(`SELECT owner, repo, name FROM skill_likes`)).toEqual([{ owner: 'react', repo: 'react', name: 'fix' }])
    expect(rows(`SELECT owner, repo, name FROM skill_revisions`)).toEqual([{ owner: 'react', repo: 'react', name: 'fix' }])
    expect(rows(`SELECT owner, repo FROM skill_subscriptions`)).toEqual([{ owner: 'react', repo: 'react' }])
    expect(rows(`SELECT DISTINCT owner, repo FROM repo_star_observations`)).toEqual([{ owner: 'react', repo: 'react' }])
  })

  it('keeps the old name as an alias row', async () => {
    await syncRepo('facebook', 'react', {}, d1.db)

    expect(rows(`SELECT owner, repo, repository_id, target_owner, target_repo, root_skill, moved_at FROM repo_aliases`)).toEqual([
      { owner: 'facebook', repo: 'react', repository_id: REACT_ID, target_owner: 'react', target_repo: 'react', root_skill: null, moved_at: NOW },
    ])
  })

  it('queues every moved Skill for a trust and indexability recompute', async () => {
    await syncRepo('facebook', 'react', {}, d1.db)

    expect(rows(`SELECT owner, repo, name FROM skill_dirty WHERE reason = 'repository_moved' ORDER BY name`)).toEqual([
      { owner: 'react', repo: 'react', name: 'fix' },
      { owner: 'react', repo: 'react', name: 'verify' },
    ])
  })

  it('leaves the embedding marker under the old name, so the prune removes the old vector', async () => {
    seedRepo('acme', 'skills')
    for (const name of ['one', 'two', 'three']) {
      seedSkill('acme', 'skills', name)
      exec(`INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ('acme', 'skills', '${name}', 'embedding', 'sha-${name}', '{}', '2026-10-01')`)
    }
    await syncRepo('facebook', 'react', {}, d1.db)
    const deleteByIds = vi.fn(async () => ({ mutationId: 'm' }))

    const outcome = await pruneOrphanEmbeddings({ db: d1.db, vectorize: { deleteByIds } })

    expect(rows(`SELECT owner, repo, kind FROM skill_generated WHERE name = 'fix' ORDER BY kind`)).toEqual([
      { owner: 'react', repo: 'react', kind: 'faq' },
    ])
    expect(outcome.deleted).toBe(1)
    expect(deleteByIds).toHaveBeenCalledWith([await vectorIdFor({ owner: 'facebook', repo: 'react', name: 'fix' })])
  })

  it('moves nothing when GitHub only changes the case of the name', async () => {
    github.getRepoSummary.mockResolvedValue(githubAnswer('Facebook/React', REACT_ID))

    const stats = await syncRepo('facebook', 'react', {}, d1.db)

    expect(stats.movedTo).toBeUndefined()
    expect(rows(`SELECT owner, repo, repository_id FROM repos`)).toEqual([{ owner: 'facebook', repo: 'react', repository_id: REACT_ID }])
    expect(rows(`SELECT COUNT(*) AS aliases FROM repo_aliases`)).toEqual([{ aliases: 0 }])
  })
})

describe('a move into a name the registry already holds', () => {
  beforeEach(() => {
    seedUser(101)
    seedUser(102)
    seedRepo('vuejs-ai', 'skills')
    seedSkill('vuejs-ai', 'skills', 'vue-best-practices')
    seedRepo('hyf0', 'vue-skills', { source: 'vuejs-ai/skills' })
    seedSkill('hyf0', 'vue-skills', 'vue-best-practices')
    seedSkill('hyf0', 'vue-skills', 'vue-debug-guides')
    exec(`
      INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES
        (101, 'vuejs-ai', 'skills', 'vue-best-practices', 1),
        (101, 'hyf0', 'vue-skills', 'vue-best-practices', 1),
        (102, 'hyf0', 'vue-skills', 'vue-best-practices', 1);
      INSERT INTO collections_v2 (id, author_user_id, slug, name, created_at, updated_at) VALUES (901, 101, 'vue', 'Vue', 1, 1);
      INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name) VALUES
        (901, 0, 'vuejs-ai', 'skills', 'vue-best-practices'),
        (901, 1, 'hyf0', 'vue-skills', 'vue-best-practices'),
        (901, 2, 'hyf0', 'vue-skills', 'vue-debug-guides');
    `)
    github.getRepoSummary.mockResolvedValue(githubAnswer('vuejs-ai/skills', 1138832642))
  })

  it('merges into the held row and drops the duplicates', async () => {
    await syncRepo('hyf0', 'vue-skills', {}, d1.db)

    expect(rows(`SELECT owner, repo FROM repos`)).toEqual([{ owner: 'vuejs-ai', repo: 'skills' }])
    expect(rows(`SELECT owner, repo, name FROM skills ORDER BY name`)).toEqual([
      { owner: 'vuejs-ai', repo: 'skills', name: 'vue-best-practices' },
      { owner: 'vuejs-ai', repo: 'skills', name: 'vue-debug-guides' },
    ])
    expect(rows(`SELECT user_id, owner, repo FROM skill_likes ORDER BY user_id`)).toEqual([
      { user_id: 101, owner: 'vuejs-ai', repo: 'skills' },
      { user_id: 102, owner: 'vuejs-ai', repo: 'skills' },
    ])
    expect(rows(`SELECT position, owner, repo, name FROM collection_skills_v2 WHERE collection_id = 901 ORDER BY position`)).toEqual([
      { position: 0, owner: 'vuejs-ai', repo: 'skills', name: 'vue-best-practices' },
      { position: 2, owner: 'vuejs-ai', repo: 'skills', name: 'vue-debug-guides' },
    ])
  })
})

describe('a move into a name a different Repository holds', () => {
  beforeEach(() => {
    seedUser(101)
    // A stale row: GitHub stopped serving this Repository, markRepoMissing
    // kept the row, and its name carries its own Repository ID.
    exec(`INSERT INTO repos (owner, repo, repository_id, repo_skill_count, last_tree_sha) VALUES ('vuejs-ai', 'skills', 111, 1, 'tree-1')`)
    seedSkill('vuejs-ai', 'skills', 'held-skill')
    seedRepo('hyf0', 'vue-skills')
    seedSkill('hyf0', 'vue-skills', 'moved-skill')
    github.getRepoSummary.mockResolvedValue(githubAnswer('vuejs-ai/skills', 222))
  })

  it('refuses the move instead of merging another Repository\'s rows', async () => {
    const stats = await syncRepo('hyf0', 'vue-skills', {}, d1.db)

    expect(stats.status).toBe('failed')
    expect(stats.reason).toContain('move_refused')
    expect(rows(`SELECT owner, repo, repository_id FROM repos ORDER BY owner`)).toEqual([
      { owner: 'hyf0', repo: 'vue-skills', repository_id: null },
      { owner: 'vuejs-ai', repo: 'skills', repository_id: 111 },
    ])
    expect(rows(`SELECT owner, repo, name FROM skills ORDER BY name`)).toEqual([
      { owner: 'vuejs-ai', repo: 'skills', name: 'held-skill' },
      { owner: 'hyf0', repo: 'vue-skills', name: 'moved-skill' },
    ])
    expect(rows(`SELECT COUNT(*) AS aliases FROM repo_aliases`)).toEqual([{ aliases: 0 }])
  })
})

describe('a move that renames a root Skill', () => {
  it('renames the Skill to the new Repository name and records it on the alias', async () => {
    seedRepo('palkan', 'skills', { source: 'palkan/layered-rails-skills' })
    seedSkill('palkan', 'skills', 'skills', 'SKILL.md')
    exec(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at) VALUES ('palkan', 'skills', 'skills', 'commit-1', 1)`)
    github.getRepoSummary.mockResolvedValue(githubAnswer('palkan/layered-rails-skills', 1150861761))

    await syncRepo('palkan', 'skills', {}, d1.db)

    expect(rows(`SELECT owner, repo, name, slug FROM skills`)).toEqual([
      { owner: 'palkan', repo: 'layered-rails-skills', name: 'layered-rails-skills', slug: 'palkan/layered-rails-skills' },
    ])
    expect(rows(`SELECT name FROM skill_revisions`)).toEqual([{ name: 'layered-rails-skills' }])
    expect(rows(`SELECT root_skill, target_root_skill FROM repo_aliases`)).toEqual([
      { root_skill: 'skills', target_root_skill: 'layered-rails-skills' },
    ])
  })
})

describe('the backfill SQL', () => {
  const move = {
    from: { owner: 'facebook', repo: 'react' },
    to: { owner: 'react', repo: 'react' },
    source: { owner: 'react', repo: 'react' },
    repositoryId: REACT_ID,
    movedAt: NOW,
  }

  beforeEach(() => {
    seedRepo('facebook', 'react')
    seedSkill('facebook', 'react', 'fix')
    exec(`INSERT INTO skill_social_posts (skill_slug, platform, post_url, post_id, author_handle, text_extract, fetched_at)
      VALUES ('facebook/fix', 'bsky', 'https://bsky.app/p/1', 'p1', 'dan', 'try fix', 1)`)
  })

  it('moves the rows the same way the sync batch does', () => {
    exec(`INSERT INTO ai_ready_pages (route, route_key, updated_at, indexed_at) VALUES
      ('/gh/facebook/react', 'a', '2026-10-01', 1),
      ('/gh/facebook/react/fix', 'b', '2026-10-01', 1),
      ('/gh/facebook/react-native', 'c', '2026-10-01', 1)`)

    exec(repositoryMoveSql(move))

    expect(rows(`SELECT owner, repo, name, slug FROM skills`)).toEqual([{ owner: 'react', repo: 'react', name: 'fix', slug: 'react/fix' }])
    expect(rows(`SELECT skill_slug FROM skill_social_posts`)).toEqual([{ skill_slug: 'react/fix' }])
    expect(rows(`SELECT route FROM ai_ready_pages`)).toEqual([{ route: '/gh/facebook/react-native' }])
    expect(rows(`SELECT owner, repo, target_owner, target_repo FROM repo_aliases`)).toEqual([
      { owner: 'facebook', repo: 'react', target_owner: 'react', target_repo: 'react' },
    ])
  })

  it('changes nothing when it runs a second time', async () => {
    exec(repositoryMoveSql(move))
    const before = rows(`SELECT * FROM skills`)

    exec(repositoryMoveSql(move))
    await moveRepository(d1.db, { ...move, movedAt: NOW + 60 })

    expect(rows(`SELECT * FROM skills`)).toEqual(before)
    expect(rows(`SELECT moved_at FROM repo_aliases`)).toEqual([{ moved_at: NOW }])
  })

  it('keeps every column of the Repository row', async () => {
    // Filled from the migrated schema, so a column added later fails here
    // until the move copies it too.
    const columns = rows<{ name: string, type: string }>(`PRAGMA table_info(repos)`)
      .filter(column => !['owner', 'repo'].includes(column.name))
    const value = (column: { name: string, type: string }) => {
      if (column.name === 'repo_kind')
        return `'catalog'`
      if (column.name === 'repo_kind_source')
        return `'override'`
      return column.type === 'INTEGER' ? '7' : `'${column.name}-value'`
    }
    exec(`UPDATE repos SET ${columns.map(column => `${column.name} = ${value(column)}`).join(', ')} WHERE owner = 'facebook'`)
    const [before] = rows<Record<string, unknown>>(`SELECT * FROM repos WHERE owner = 'facebook'`)

    await moveRepository(d1.db, move)

    const [after] = rows<Record<string, unknown>>(`SELECT * FROM repos`)
    expect(after).toEqual({
      ...before,
      owner: 'react',
      repo: 'react',
      source_owner: 'react',
      source_repo: 'react',
      repository_id: REACT_ID,
    })
  })

  it('refuses a move to the same name', () => {
    expect(() => repositoryMoveSql({ ...move, to: { owner: 'Facebook', repo: 'React' } })).toThrow('cannot move to its own name')
  })
})

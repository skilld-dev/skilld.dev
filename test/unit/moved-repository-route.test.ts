import type { RepositoryMove } from '../../layers/registry/server/utils/repository-move'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  indexRepositoryAliases,
  loadRepositoryAliases,
  REPOSITORY_ALIASES_CACHE_KEY,
  resolveMovedRepositoryRoute,
} from '../../layers/registry/server/utils/repository-aliases'
import { moveRepository } from '../../layers/registry/server/utils/repository-move'
import { findSkillPagePath } from '../../layers/registry/server/utils/skill-page-url'
import { findSkillRunIdentity } from '../../layers/registry/server/utils/skill-run-identity'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

let d1: SqliteD1

beforeEach(() => {
  d1 = createSqliteD1(allMigrations())
})

afterEach(() => d1.close())

function memoryCache() {
  const store = new Map<string, unknown>()
  return {
    store,
    getItem: async <T>(key: string) => (store.get(key) as T | undefined) ?? null,
    setItem: async (key: string, value: never) => {
      store.set(key, value)
    },
  }
}

function seed(owner: string, repo: string, skills: Array<{ name: string, path: string }>): void {
  d1.raw.exec(`INSERT INTO repos (owner, repo, repo_skill_count) VALUES ('${owner}', '${repo}', ${skills.length})`)
  for (const skill of skills) {
    d1.raw.exec(`
      INSERT INTO skills (owner, repo, name, display_name, slug, source_resolved, rendered_skill_path, rendered_status)
      VALUES ('${owner}', '${repo}', '${skill.name}', '${skill.name}', '${owner}/${skill.name}', 1, '${skill.path}', 'ok');
      INSERT INTO skill_revisions (owner, repo, name, sha, modified_at)
      VALUES ('${owner}', '${repo}', '${skill.name}', '${'a'.repeat(40)}', 1);
    `)
  }
}

function move(from: string, to: string, repositoryId = 1): RepositoryMove {
  const [fromOwner, fromRepo] = from.split('/') as [string, string]
  const [toOwner, toRepo] = to.split('/') as [string, string]
  return {
    from: { owner: fromOwner, repo: fromRepo },
    to: { owner: toOwner, repo: toRepo },
    source: { owner: toOwner, repo: toRepo },
    repositoryId,
    movedAt: 1_790_000_000,
  }
}

async function route(pathname: string, search = '') {
  const aliases = await loadRepositoryAliases(memoryCache(), d1.db)
  return resolveMovedRepositoryRoute(pathname, search, indexRepositoryAliases(aliases ?? []))
}

describe('the old URLs of a moved Repository', () => {
  beforeEach(async () => {
    seed('facebook', 'react', [
      { name: 'fix', path: 'compiler/skills/fix/SKILL.md' },
      { name: 'verify', path: 'compiler/skills/verify/SKILL.md' },
    ])
    await moveRepository(d1.db, move('facebook/react', 'react/react', 10270250))
  })

  it('answers 301 from the Repository hub and every Skill page under it', async () => {
    expect(await route('/gh/facebook/react')).toEqual({ _tag: 'redirect', location: '/gh/react/react' })
    expect(await route('/gh/facebook/react/fix')).toEqual({ _tag: 'redirect', location: '/gh/react/react/fix' })
    expect(await route('/gh/Facebook/React/verify', '?tab=files')).toEqual({ _tag: 'redirect', location: '/gh/react/react/verify?tab=files' })
  })

  it('moves file deep links and the agent copies too', async () => {
    expect(await route('/gh/facebook/react/fix/-/references/rules.md')).toEqual({
      _tag: 'redirect',
      location: '/gh/react/react/fix/-/references/rules.md',
    })
    expect(await route('/gh/facebook/react/fix.md')).toEqual({ _tag: 'redirect', location: '/gh/react/react/fix.md' })
    expect(await route('/gh/facebook/react.md')).toEqual({ _tag: 'redirect', location: '/gh/react/react.md' })
  })

  it('leaves the old owner hub and its other Repositories alone', async () => {
    seed('facebook', 'docusaurus', [{ name: 'docs', path: 'skills/docs/SKILL.md' }])

    expect(await route('/gh/facebook')).toEqual({ _tag: 'pass' })
    expect(await route('/gh/facebook/docusaurus/docs')).toEqual({ _tag: 'pass' })
    expect(await route('/skills/facebook/react/fix')).toEqual({ _tag: 'pass' })
  })

  it('stops redirecting once the registry holds the old name again', async () => {
    seed('facebook', 'react', [{ name: 'other', path: 'skills/other/SKILL.md' }])

    expect(await route('/gh/facebook/react/other')).toEqual({ _tag: 'pass' })
  })

  it('reads the aliases once and serves the next request from the cache', async () => {
    const cache = memoryCache()
    await loadRepositoryAliases(cache, d1.db)
    d1.raw.exec(`DELETE FROM repo_aliases`)

    const aliases = await loadRepositoryAliases(cache, d1.db)

    expect(cache.store.has(REPOSITORY_ALIASES_CACHE_KEY)).toBe(true)
    expect(aliases).toHaveLength(1)
  })
})

describe('a Repository that moves twice', () => {
  it('sends the first name straight to the latest one', async () => {
    seed('a', 'one', [{ name: 'tool', path: 'skills/tool/SKILL.md' }])
    await moveRepository(d1.db, move('a/one', 'b/two'))
    await moveRepository(d1.db, move('b/two', 'c/three'))

    expect(await route('/gh/a/one/tool')).toEqual({ _tag: 'redirect', location: '/gh/c/three/tool' })
    expect(await route('/gh/b/two/tool')).toEqual({ _tag: 'redirect', location: '/gh/c/three/tool' })
  })

  it('drops the alias when it moves back', async () => {
    seed('a', 'one', [{ name: 'tool', path: 'skills/tool/SKILL.md' }])
    await moveRepository(d1.db, move('a/one', 'b/two'))
    await moveRepository(d1.db, move('b/two', 'a/one'))

    expect(await route('/gh/a/one/tool')).toEqual({ _tag: 'pass' })
    expect(await route('/gh/b/two/tool')).toEqual({ _tag: 'redirect', location: '/gh/a/one/tool' })
  })
})

describe('a renamed root Skill', () => {
  it('redirects its old page to the Skill under the new name', async () => {
    seed('palkan', 'skills', [{ name: 'skills', path: 'SKILL.md' }])
    await moveRepository(d1.db, move('palkan/skills', 'palkan/layered-rails-skills'))

    expect(await route('/gh/palkan/skills/skills')).toEqual({
      _tag: 'redirect',
      location: '/gh/palkan/layered-rails-skills/layered-rails-skills',
    })
  })
})

describe('the Skill page under the new name', () => {
  beforeEach(async () => {
    seed('facebook', 'react', [
      { name: 'fix', path: 'compiler/skills/fix/SKILL.md' },
      { name: 'verify', path: 'compiler/skills/verify/SKILL.md' },
    ])
    await moveRepository(d1.db, move('facebook/react', 'react/react', 10270250))
  })

  it('is the page both names link to', async () => {
    const page = '/gh/react/react/fix'

    expect(await findSkillPagePath(d1.db, { owner: 'react', repository: 'react', skillPath: 'compiler/skills/fix' })).toBe(page)
    expect(await findSkillPagePath(d1.db, { owner: 'facebook', repository: 'react', skillPath: 'compiler/skills/fix' })).toBe(page)
  })

  it('is what a run of the old name resolves', async () => {
    expect(await findSkillRunIdentity(d1.db, { owner: 'facebook', repository: 'react', name: 'fix' })).toEqual({
      skillPath: 'compiler/skills/fix',
      commitSha: 'a'.repeat(40),
    })
  })
})

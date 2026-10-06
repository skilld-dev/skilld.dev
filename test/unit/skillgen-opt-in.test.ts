// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkSkillgenEligibility,
  optedInSkillgenRepositories,
  optInSkillgenRepository,
  optOutSkillgenRepository,
  skillgenCandidates,
} from '../../layers/identity/server/utils/skillgen'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const ref = { owner: 'harlan-zw', repo: 'nuxt-skew-protection' }

function file(text: string): Response {
  return Response.json({ encoding: 'base64', content: btoa(text) })
}

/**
 * A GitHub stub for one repository: its permissions, the default branch tree,
 * and the `package.json` files by path. Any other path answers 404.
 */
function repository(name: string, files: Record<string, unknown>, options: { private?: boolean, maintain?: boolean } = {}) {
  const prefix = `/repos/harlan-zw/${name}`
  // GitHub matches owner and repository names without case.
  return async (requested: string) => {
    const path = requested.toLowerCase()
    if (path === prefix)
      return Response.json({ full_name: `Harlan-Zw/${name}`, private: options.private ?? false, permissions: { admin: false, maintain: options.maintain ?? true } })
    if (path === `${prefix}/git/trees/head?recursive=1`)
      return Response.json({ truncated: false, tree: Object.keys(files).map(file => ({ path: file, type: 'blob' })) })
    const contents = path.startsWith(`${prefix}/contents/`) ? requested.slice(`${prefix}/contents/`.length) : undefined
    if (contents !== undefined && files[contents] !== undefined)
      return file(JSON.stringify(files[contents]))
    return new Response(null, { status: 404 })
  }
}

describe('skillgen eligibility', () => {
  it('accepts a root package whose Skill sits in skills/', async () => {
    const result = await checkSkillgenEligibility(repository('nuxt-skew-protection', {
      'package.json': { name: 'nuxt-skew-protection', version: '1.6.2' },
      'skills/nuxt-skew-protection/SKILL.md': '',
    }), ref)
    // GitHub's casing is stored, so later lookups match what the Worker sends.
    expect(result).toEqual({ _tag: 'Eligible', owner: 'Harlan-Zw', repo: 'nuxt-skew-protection', packages: ['nuxt-skew-protection'] })
  })

  it('accepts a monorepo whose published package keeps its Skill under packages/', async () => {
    const result = await checkSkillgenEligibility(repository('ripast', {
      'package.json': { name: 'ripast-monorepo', private: true },
      'packages/cli/package.json': { name: '@ripast/cli', version: '0.5.0' },
      'packages/cli/skills/ripast/SKILL.md': '',
      'packages/core/package.json': { name: '@ripast/core', version: '0.5.0' },
    }), { owner: 'harlan-zw', repo: 'ripast' })
    expect(result).toMatchObject({ _tag: 'Eligible', packages: ['@ripast/cli'] })
  })

  it('names every package with a Skill, and ignores Skills in test fixtures', async () => {
    const result = await checkSkillgenEligibility(repository('nuxt-seo', {
      'package.json': { private: true, version: '5.3.16' },
      'packages/nuxt-seo/package.json': { name: '@nuxtjs/seo', version: '5.3.16' },
      'packages/nuxt-seo/skills/nuxtjs-seo/SKILL.md': '',
      'packages/nuxt-seo/test/fixtures/basic/skills/internal/SKILL.md': '',
      'packages/devtools-layer/package.json': { name: 'nuxtseo-layer-devtools', version: '5.3.16' },
      'packages/devtools-layer/skills/devtools-layer-skilld/SKILL.md': '',
    }), { owner: 'harlan-zw', repo: 'nuxt-seo' })
    expect(result).toMatchObject({ _tag: 'Eligible', packages: ['nuxtseo-layer-devtools', '@nuxtjs/seo'] })
  })

  it('tells a missing package apart from a missing Skill and an unpublished package', async () => {
    expect(await checkSkillgenEligibility(repository('docs', { 'README.md': '' }), { owner: 'harlan-zw', repo: 'docs' })).toEqual({ _tag: 'NoPackage' })
    expect(await checkSkillgenEligibility(repository('tool', { 'packages/tool/package.json': { name: 'tool' } }), { owner: 'harlan-zw', repo: 'tool' })).toEqual({ _tag: 'NoSkill' })
    expect(await checkSkillgenEligibility(repository('app', {
      'package.json': { name: 'app', private: true },
      'skills/app/SKILL.md': '',
    }), { owner: 'harlan-zw', repo: 'app' })).toEqual({ _tag: 'UnpublishedPackage' })
  })

  it('refuses an account without maintain access, and a private repository', async () => {
    expect(await checkSkillgenEligibility(repository('nuxt-skew-protection', {}, { maintain: false }), ref)).toEqual({ _tag: 'NotMaintainer' })
    expect(await checkSkillgenEligibility(repository('nuxt-skew-protection', {}, { private: true }), ref)).toEqual({ _tag: 'NotPublic' })
  })

  it('reports a GitHub failure instead of a refusal', async () => {
    expect(await checkSkillgenEligibility(async () => new Response(null, { status: 502 }), ref))
      .toEqual({ _tag: 'GithubUnavailable', status: 502 })
  })
})

describe('skillgen opt-ins', () => {
  let fixture: SqliteD1

  beforeEach(() => {
    fixture = createSqliteD1(allMigrations())
    fixture.raw.exec(`
      INSERT INTO repos (owner, repo) VALUES ('Harlan-Zw', 'nuxt-skew-protection'), ('harlan-zw', 'no-skills');
      INSERT INTO skills (name, owner, repo, display_name, slug) VALUES ('skew', 'Harlan-Zw', 'nuxt-skew-protection', 'Skew', 'skew');
    `)
  })

  afterEach(() => fixture.close())

  it('lists only repositories with a registry Skill, matched without case', async () => {
    const rows = await skillgenCandidates(fixture.db, [
      { owner: 'harlan-zw', repo: 'NUXT-SKEW-PROTECTION' },
      { owner: 'harlan-zw', repo: 'no-skills' },
      { owner: 'harlan-zw', repo: 'not-in-registry' },
    ])
    expect(rows).toEqual([{ owner: 'Harlan-Zw', repo: 'nuxt-skew-protection', optedIn: false }])
  })

  it('answers the Worker with the opted-in subset until the repository opts out', async () => {
    await optInSkillgenRepository(fixture.db, 7, { owner: 'Harlan-Zw', repo: 'nuxt-skew-protection' }, 1)

    expect(await optedInSkillgenRepositories(fixture.db, ['harlan-zw/nuxt-skew-protection', 'someone/else']))
      .toEqual(['harlan-zw/nuxt-skew-protection'])
    expect(await skillgenCandidates(fixture.db, [ref])).toEqual([{ owner: 'Harlan-Zw', repo: 'nuxt-skew-protection', optedIn: true }])

    await optOutSkillgenRepository(fixture.db, { owner: 'harlan-zw', repo: 'NUXT-skew-protection' })
    expect(await optedInSkillgenRepositories(fixture.db, ['harlan-zw/nuxt-skew-protection'])).toEqual([])
  })
})

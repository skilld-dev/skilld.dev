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
const prefix = '/repos/harlan-zw/nuxt-skew-protection'

function file(text: string): Response {
  return Response.json({ encoding: 'base64', content: btoa(text) })
}

/** A GitHub stub: each path answers its listed response, anything else 404s. */
function github(routes: Record<string, () => Response>) {
  return async (path: string) => routes[path]?.() ?? new Response(null, { status: 404 })
}

const maintained = () => Response.json({ full_name: 'Harlan-Zw/nuxt-skew-protection', private: false, permissions: { admin: false, maintain: true } })

describe('skillgen eligibility', () => {
  it('accepts a maintained npm package whose Skill sits under its unscoped name', async () => {
    const result = await checkSkillgenEligibility(github({
      [prefix]: maintained,
      [`${prefix}/contents/package.json`]: () => file(JSON.stringify({ name: '@harlan-zw/nuxt-skew-protection' })),
      [`${prefix}/contents/skills/nuxt-skew-protection/SKILL.md`]: () => file('---\nname: x\n---'),
    }), ref)
    // GitHub's casing is stored, so later lookups match what the Worker sends.
    expect(result).toEqual({ _tag: 'Eligible', owner: 'Harlan-Zw', repo: 'nuxt-skew-protection' })
  })

  it('accepts a root SKILL.md', async () => {
    const result = await checkSkillgenEligibility(github({
      [prefix]: maintained,
      [`${prefix}/contents/package.json`]: () => file(JSON.stringify({ name: 'nuxt-skew-protection' })),
      [`${prefix}/contents/SKILL.md`]: () => file('---\nname: x\n---'),
    }), ref)
    expect(result._tag).toBe('Eligible')
  })

  it('refuses a repository without a root package.json, since only npm is supported', async () => {
    expect(await checkSkillgenEligibility(github({ [prefix]: maintained }), ref)).toEqual({ _tag: 'NoPackageJson' })
    expect(await checkSkillgenEligibility(github({
      [prefix]: maintained,
      [`${prefix}/contents/package.json`]: () => file('not json'),
    }), ref)).toEqual({ _tag: 'NoPackageJson' })
  })

  it('names the Skill path it expected when none exists', async () => {
    expect(await checkSkillgenEligibility(github({
      [prefix]: maintained,
      [`${prefix}/contents/package.json`]: () => file(JSON.stringify({ name: '@scope/widget' })),
    }), ref)).toEqual({ _tag: 'NoSkill', expected: 'skills/widget/SKILL.md' })
  })

  it('refuses an account with only push access, and a private repository', async () => {
    expect(await checkSkillgenEligibility(github({
      [prefix]: () => Response.json({ full_name: 'harlan-zw/nuxt-skew-protection', private: false, permissions: { admin: false, maintain: false, push: true } }),
    }), ref)).toEqual({ _tag: 'NotMaintainer' })
    expect(await checkSkillgenEligibility(github({
      [prefix]: () => Response.json({ full_name: 'harlan-zw/nuxt-skew-protection', private: true, permissions: { admin: true } }),
    }), ref)).toEqual({ _tag: 'NotPublic' })
  })

  it('reports a GitHub failure instead of a refusal', async () => {
    expect(await checkSkillgenEligibility(github({ [prefix]: () => new Response(null, { status: 502 }) }), ref))
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

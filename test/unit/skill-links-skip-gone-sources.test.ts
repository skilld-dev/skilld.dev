import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSkillsByLookups, getFeaturedOfficialSections } from '../../layers/registry/server/utils/skills-registry'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// A Skill whose SKILL.md is gone upstream answers 410. Every page that links
// it carries a broken internal link, so a Skill card read must skip it.

let fixture: SqliteD1

beforeEach(() => {
  fixture = createSqliteD1(allMigrations())
  fixture.raw.exec(`
    INSERT INTO repos (owner, repo, stars) VALUES ('acme', 'skills', 10);
    INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, modified_at) VALUES
      ('acme', 'skills', 'live', 'acme/live', 'Live', 1, 1),
      ('acme', 'skills', 'removed', 'acme/removed', 'Removed', 0, 2);
  `)
})

afterEach(() => fixture.close())

function event(): H3Event {
  return { context: { platform: { db: fixture.db } } } as unknown as H3Event
}

describe('skill card reads skip a Skill whose source is gone', () => {
  it('resolves related Skill names to live Skills only', async () => {
    const found = await findSkillsByLookups(event(), [{ packageName: 'live' }, { packageName: 'removed' }])

    expect([...found.keys()]).toEqual(['live'])
  })

  it('still resolves a removed Skill for the CLI name lookup', async () => {
    const found = await findSkillsByLookups(event(), [{ packageName: 'removed' }], { includeBroken: true })

    expect(found.get('removed')?.repo).toBe('skills')
  })

  it('features live Skills only and counts only those', async () => {
    const sections = await getFeaturedOfficialSections(event(), [{ owner: 'acme', repo: 'skills' }], 5)

    expect(sections.map(section => ({ total: section.totalSkills, names: section.skills.map(skill => skill.name) })))
      .toEqual([{ total: 1, names: ['live'] }])
  })
})

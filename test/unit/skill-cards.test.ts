import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSkillsByKeys } from '../../layers/registry/server/utils/skills-registry'
import { loadSkillCardRows, presentSkillSummary, skillCardKey, skillCardSourceFromRow } from '../../shared/server/skill-cards'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

let d1: SqliteD1

beforeEach(() => {
  d1 = createSqliteD1(allMigrations())
  d1.raw.exec(`
    INSERT INTO repos (owner, repo, stars, default_branch, source_owner, source_repo) VALUES
      ('acme', 'old-name', 50, 'main', 'acme-org', 'new-name'),
      ('solo', 'hub', 5, 'trunk', NULL, NULL);
    INSERT INTO skills (owner, repo, name, display_name, slug, source_resolved, current_sha, rendered_skill_path, modified_at, like_count) VALUES
      ('acme', 'old-name', 'lint', 'Lint', 'acme/lint', 1, 'abc123', 'skills/lint/SKILL.md', 1790000000, 4),
      ('acme', 'old-name', 'format', 'Format', 'acme/format', 1, 'abc123', 'skills/format/SKILL.md', 1790000000, 0),
      ('solo', 'hub', 'only', 'Only', 'solo/only', 1, NULL, 'SKILL.md', NULL, 2),
      ('solo', 'hub', 'unresolved', 'Unresolved', 'solo/unresolved', 0, NULL, NULL, NULL, 0);
  `)
})

afterEach(() => d1.close())

describe('skill cards', () => {
  it('present the same card from the shared loader as from the registry', async () => {
    const lint = { owner: 'acme', repo: 'old-name', name: 'lint' }
    const only = { owner: 'solo', repo: 'hub', name: 'only' }
    const event = { context: { platform: { db: d1.db } } } as unknown as H3Event

    const registry = await findSkillsByKeys(event, [lint, only])
    const rows = await loadSkillCardRows(d1.db, [lint, only])
    const fromRegistry = [lint, only].map(ref => presentSkillSummary(registry.get(skillCardKey(ref))!))
    const fromLoader = [lint, only].map(ref => presentSkillSummary(skillCardSourceFromRow(rows.get(skillCardKey(ref))!)))

    expect(fromLoader).toEqual(fromRegistry)
    expect(fromLoader.map(card => [card.pageUrl, card.sourceUrl])).toEqual([
      // A renamed Repository keeps its registry route and links GitHub's current name.
      ['https://skilld.dev/gh/acme/old-name/lint', 'https://github.com/acme-org/new-name/blob/abc123/skills/lint/SKILL.md'],
      // One resolved Skill routes to the Repository hub. No synced commit falls back to the default branch.
      ['https://skilld.dev/gh/solo/hub', 'https://github.com/solo/hub/blob/trunk/SKILL.md'],
    ])
  })
})

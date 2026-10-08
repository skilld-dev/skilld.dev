import type { ExistingRepo } from '../../layers/registry/server/utils/sync-repo'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadStoredSkillRow, resolveReferencedFileTarget } from '../../layers/registry/server/utils/skill-stored-source'
import { GENERAL_SYNC_CANDIDATES_SQL } from '../../layers/registry/server/utils/sync-candidates'
import { unchangedRepoStatus } from '../../layers/registry/server/utils/sync-repo'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const migration = 'migrations/0148_skill_snapshot_commit.sql'

describe('skill snapshot migration', () => {
  it.each([true, false])('refreshes dormant nested Skills, recorded revision: %s', async (hasRevision) => {
    const fixture = createSqliteD1(allMigrations().filter(path => path !== migration))
    const skill = { owner: 'acme', repo: 'skills', name: 'setup' }
    fixture.raw.exec(`
      INSERT INTO repos (owner, repo, default_branch, last_tree_sha, pushed_at, repo_meta_synced_at)
      VALUES ('acme', 'skills', 'main', 'tree', 100, 100);
      INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
        rendered_status, rendered_raw, rendered_skill_path, assets, references_count)
      VALUES ('acme', 'skills', 'setup', 'acme/skills/setup', 'Setup', 1,
        'ok', '# Skill', 'skills/setup/SKILL.md', '[{"path":"new.md","size":10,"type":"markdown"}]', 1);
    `)
    if (hasRevision) {
      fixture.raw.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at)
        VALUES ('acme', 'skills', 'setup', ?, 50)`).run('a'.repeat(40))
    }
    fixture.raw.exec(readFileSync(migration, 'utf8'))
    expect(fixture.raw.prepare(GENERAL_SYNC_CANDIDATES_SQL).all(1, 10)).toEqual([
      { owner: 'acme', repo: 'skills', ls: null, owner_verified: 0 },
    ])
    const existing = fixture.raw.prepare('SELECT last_tree_sha, pushed_at, source_owner, source_repo FROM repos').get() as unknown as ExistingRepo
    expect(unchangedRepoStatus({ existing, hasAdmittedSkills: true, headTreeSha: 'tree', repoPushedAt: 100 })).toBeNull()
    const row = await loadStoredSkillRow(fixture.db, skill)
    expect(resolveReferencedFileTarget(skill, row!, 'new.md')).toEqual({ _tag: 'unavailable' })
    fixture.close()
  })
})

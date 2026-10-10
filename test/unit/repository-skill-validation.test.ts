import { expect, it } from 'vitest'
import { loadRepositorySkillValidation } from '../../shared/server/skill-validation-sources'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

it('selects one Repository independently of account identity and excludes confirmed forks', async () => {
  const harness = createSqliteD1(allMigrations())
  try {
    for (const [owner, repo, fork] of [['org', 'wanted', 0], ['org', 'other', 0], ['elsewhere', 'wanted', 0], ['org', 'fork', 1]] as const) {
      harness.raw.prepare('INSERT INTO repos (owner,repo,is_fork) VALUES (?,?,?)').run(owner, repo, fork)
      harness.raw.prepare(`INSERT INTO skills (owner,repo,name,display_name,slug,source_resolved,rendered_raw,rendered_skill_path,rendered_commit_sha)
        VALUES (?,?,?,?,?,1,?,?,?)`)
        .run(owner, repo, 'example', 'Example', 'example', '---\nname: example\ndescription: Works.\nversion: "1"\n---\nInstructions', 'skills/example/SKILL.md', 'sha')
    }
    const selected = await loadRepositorySkillValidation(harness.db, { _tag: 'repository', owner: 'org', repo: 'WANTED' })
    expect(selected).toMatchObject({ checked: 1, pending: 0, items: [{ repository: 'org/wanted', sourceUrl: 'https://github.com/org/wanted/blob/sha/skills/example/SKILL.md' }] })
    expect(selected.items).toHaveLength(1)
    expect(await loadRepositorySkillValidation(harness.db, { _tag: 'repository', owner: 'org', repo: 'fork' })).toEqual({ checked: 0, pending: 0, items: [] })
    const owner = await loadRepositorySkillValidation(harness.db, { _tag: 'owner', owner: 'org' })
    expect(owner.checked).toBe(2)
  }
  finally {
    harness.close()
  }
})

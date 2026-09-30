import type { SqliteD1 } from './helpers/d1-sqlite'
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSkillPageUrl } from '../../layers/artifact-delivery/server/utils/skill-page'
import { findSkillPagePath } from '../../layers/registry/server/utils/skill-page-url'
import { createSqliteD1 } from './helpers/d1-sqlite'

let harness: SqliteD1 | null = null
function db() {
  if (!harness) {
    harness = createSqliteD1([])
    harness.raw.exec(`CREATE TABLE skills (
      owner TEXT, repo TEXT, name TEXT,
      rendered_skill_path TEXT, source_resolved INTEGER DEFAULT 1
    )`)
  }
  return harness
}
function addSkill(owner: string, repo: string, name: string, path: string | null, resolved = 1) {
  db().raw.prepare('INSERT INTO skills VALUES (?, ?, ?, ?, ?)').run(owner, repo, name, path, resolved)
}
afterEach(() => {
  harness?.close()
  harness = null
})

describe('findSkillPagePath', () => {
  it('names the Skill route when the repository holds several Skills', async () => {
    addSkill('antfu', 'skills', 'vue', 'skills/vue/SKILL.md')
    addSkill('antfu', 'skills', 'nuxt', 'skills/nuxt/SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'antfu', repository: 'skills', skillPath: 'skills/vue' }))
      .toBe('/gh/antfu/skills/vue')
  })

  it('names the repository hub when the repository holds one Skill', async () => {
    addSkill('acme', 'solo', 'solo-skill', 'solo-skill/SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'acme', repository: 'solo', skillPath: 'solo-skill' }))
      .toBe('/gh/acme/solo')
  })

  it('finds a Skill at the repository root', async () => {
    addSkill('acme', 'root', 'root-skill', 'SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'acme', repository: 'root', skillPath: '.' }))
      .toBe('/gh/acme/root')
  })

  it('falls back to the directory name when the rendered path is missing', async () => {
    addSkill('acme', 'pair', 'a', null)
    addSkill('acme', 'pair', 'b', 'b/SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'acme', repository: 'pair', skillPath: 'a' }))
      .toBe('/gh/acme/pair/a')
  })

  it('returns null for a Skill the registry does not hold', async () => {
    addSkill('acme', 'pair', 'a', 'a/SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'acme', repository: 'pair', skillPath: 'other' })).toBeNull()
    expect(await findSkillPagePath(db().db, { owner: 'nobody', repository: 'none', skillPath: 'x' })).toBeNull()
  })

  it('returns null for a Skill whose source is gone', async () => {
    addSkill('acme', 'pair', 'a', 'a/SKILL.md', 0)
    addSkill('acme', 'pair', 'b', 'b/SKILL.md')
    addSkill('acme', 'pair', 'c', 'c/SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'acme', repository: 'pair', skillPath: 'a' })).toBeNull()
  })

  it('returns null, not the hub, when the only other Skill in the repository is live', async () => {
    addSkill('nuxt', 'scripts', 'old', '.claude/skills/old/SKILL.md', 0)
    addSkill('nuxt', 'scripts', 'live', 'skills/live/SKILL.md')
    expect(await findSkillPagePath(db().db, { owner: 'nuxt', repository: 'scripts', skillPath: '.claude/skills/old' }))
      .toBeNull()
  })
})

const readyRow = {
  id: '7f1d6d0e-8f3c-4b6f-8f2a-0a5a3c1d2e3f',
  state: 'ready',
  visibility: 'public',
  artifact_id: `sha256:${'a'.repeat(64)}`,
  attestation_json: null,
  resolved_owner: 'antfu',
  resolved_repository: 'skills',
  skill_path: 'skills/vue',
} as never

describe('resolveSkillPageUrl', () => {
  it('returns the page URL the registry lookup names', async () => {
    const lookup = vi.fn().mockResolvedValue('https://skilld.dev/gh/antfu/skills/vue')
    expect(await resolveSkillPageUrl(readyRow, lookup, vi.fn()))
      .toBe('https://skilld.dev/gh/antfu/skills/vue')
    expect(lookup).toHaveBeenCalledWith({ owner: 'antfu', repository: 'skills', skillPath: 'skills/vue' })
  })

  it('returns undefined for an unregistered Skill', async () => {
    expect(await resolveSkillPageUrl(readyRow, async () => null, vi.fn())).toBeUndefined()
  })

  it('skips the lookup for a private Artifact and for a Resolution that is not ready', async () => {
    const lookup = vi.fn()
    expect(await resolveSkillPageUrl({ ...readyRow, visibility: 'private' }, lookup, vi.fn())).toBeUndefined()
    expect(await resolveSkillPageUrl({ ...readyRow, state: 'pending' }, lookup, vi.fn())).toBeUndefined()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('reports a failed lookup and still answers', async () => {
    const report = vi.fn()
    const result = await resolveSkillPageUrl(readyRow, async () => {
      throw new Error('registry down')
    }, report)
    expect(result).toBeUndefined()
    expect(report).toHaveBeenCalledWith('registry down')
  })
})

// @vitest-environment node
import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admittedSourceRequest } from '../../layers/artifact-delivery/server/utils/admitted-identity'
import { findSkillRunIdentity } from '../../layers/registry/server/utils/skill-run-identity'
import { createSqliteD1 } from './helpers/d1-sqlite'

const OLDER = '1111111111111111111111111111111111111111'
const NEWER = '2222222222222222222222222222222222222222'

let harness: SqliteD1 | null = null
function db() {
  if (!harness) {
    harness = createSqliteD1([])
    harness.raw.exec(`CREATE TABLE skills (
      owner TEXT, repo TEXT, name TEXT,
      rendered_skill_path TEXT, source_resolved INTEGER DEFAULT 1
    );
    CREATE TABLE skill_revisions (
      owner TEXT, repo TEXT, name TEXT, sha TEXT, modified_at INTEGER
    )`)
    harness.raw.exec('CREATE TABLE repos (owner TEXT, repo TEXT)')
    harness.raw.exec(readFileSync('migrations/0144_repository_moves.sql', 'utf8'))
  }
  return harness
}
function addSkill(owner: string, repo: string, name: string, path: string | null, resolved = 1) {
  db().raw.prepare('INSERT INTO skills VALUES (?, ?, ?, ?, ?)').run(owner, repo, name, path, resolved)
}
function addRevision(owner: string, repo: string, name: string, sha: string, modifiedAt: number) {
  db().raw.prepare('INSERT INTO skill_revisions VALUES (?, ?, ?, ?, ?)').run(owner, repo, name, sha, modifiedAt)
}
afterEach(() => {
  harness?.close()
  harness = null
})

describe('findSkillRunIdentity', () => {
  it('answers the admitted folder and the commit the Skill page names', async () => {
    // pbakaus/impeccable: 20 copies, the registry admitted one.
    addSkill('pbakaus', 'impeccable', 'impeccable', 'cursor-plugin/skills/impeccable/SKILL.md')
    addRevision('pbakaus', 'impeccable', 'impeccable', OLDER, 100)
    addRevision('pbakaus', 'impeccable', 'impeccable', NEWER, 200)

    expect(await findSkillRunIdentity(db().db, { owner: 'pbakaus', repository: 'impeccable', name: 'impeccable' }))
      .toEqual({ skillPath: 'cursor-plugin/skills/impeccable', commitSha: NEWER })
  })

  it('answers the root folder for a root Skill', async () => {
    addSkill('zarazhangrui', 'frontend-slides', 'frontend-slides', 'SKILL.md')

    expect(await findSkillRunIdentity(db().db, { owner: 'zarazhangrui', repository: 'frontend-slides', name: 'frontend-slides' }))
      .toEqual({ skillPath: '.', commitSha: null })
  })

  it('matches the owner and repository whatever their case', async () => {
    addSkill('leonxlnx', 'taste-skill', 'taste-skill', 'skills/taste-skill/SKILL.md')

    expect(await findSkillRunIdentity(db().db, { owner: 'Leonxlnx', repository: 'Taste-Skill', name: 'taste-skill' }))
      .toEqual({ skillPath: 'skills/taste-skill', commitSha: null })
  })

  it('answers null for a Skill the registry does not hold, has not rendered, or lost', async () => {
    addSkill('acme', 'pair', 'unrendered', null)
    addSkill('acme', 'pair', 'gone', 'gone/SKILL.md', 0)

    expect(await findSkillRunIdentity(db().db, { owner: 'acme', repository: 'pair', name: 'other' })).toBeNull()
    expect(await findSkillRunIdentity(db().db, { owner: 'acme', repository: 'pair', name: 'unrendered' })).toBeNull()
    expect(await findSkillRunIdentity(db().db, { owner: 'acme', repository: 'pair', name: 'gone' })).toBeNull()
  })
})

describe('admittedSourceRequest', () => {
  const named: SourceRequest = {
    provider: 'github',
    owner: 'leonxlnx',
    repository: 'taste-skill',
    selector: { type: 'named-skill', name: 'taste-skill' },
  }

  it('resolves an admitted name by its folder at the commit the Skill page names', async () => {
    const lookup = vi.fn(async () => ({ skillPath: 'skills/taste-skill', commitSha: NEWER }))

    expect(await admittedSourceRequest(named, lookup)).toEqual({
      provider: 'github',
      owner: 'leonxlnx',
      repository: 'taste-skill',
      selector: { type: 'path', path: 'skills/taste-skill' },
      ref: { type: 'commit', value: NEWER },
    })
    expect(lookup).toHaveBeenCalledWith({ owner: 'leonxlnx', repository: 'taste-skill', name: 'taste-skill' })
  })

  it('keeps a reference the request names', async () => {
    const lookup = vi.fn(async () => ({ skillPath: 'skills/taste-skill', commitSha: NEWER }))
    const request: SourceRequest = { ...named, ref: { type: 'branch', value: 'next' } }

    expect(await admittedSourceRequest(request, lookup)).toMatchObject({
      selector: { type: 'path', path: 'skills/taste-skill' },
      ref: { type: 'branch', value: 'next' },
    })
  })

  it('resolves the default branch when the registry knows no commit', async () => {
    const resolved = await admittedSourceRequest(named, async () => ({ skillPath: '.', commitSha: null }))

    expect(resolved).toEqual({ ...named, selector: { type: 'path', path: '.' } })
    expect(resolved).not.toHaveProperty('ref')
  })

  it('leaves a name the registry does not hold, and a path, as requested', async () => {
    const lookup = vi.fn(async () => null)
    const path: SourceRequest = { ...named, selector: { type: 'path', path: 'skills/taste-skill' } }

    expect(await admittedSourceRequest(named, lookup)).toBe(named)
    expect(await admittedSourceRequest(path, lookup)).toBe(path)
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})

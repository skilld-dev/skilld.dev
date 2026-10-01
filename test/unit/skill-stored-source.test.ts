import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadStoredSkillRow,
  readReferencedFile,
  readStoredSkillFiles,
  readStoredSkillMd,
  resolveReferencedFileTarget,
} from '../../layers/registry/server/utils/skill-stored-source'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

let fixture: SqliteD1
const skill = { owner: 'owner', repo: 'repo', name: 'skill' }

function seed(fields: { raw?: string | null, status?: string, path?: string | null, assets?: unknown, resolved?: number }) {
  fixture.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_status, rendered_raw, rendered_skill_path, assets)
     VALUES ('owner', 'repo', 'skill', 'owner/repo/skill', 'Skill', ?, ?, ?, ?, ?)`,
  ).run(
    fields.resolved ?? 1,
    fields.status ?? 'ok',
    fields.raw === undefined ? '# Stored body' : fields.raw,
    fields.path === undefined ? 'skills/skill/SKILL.md' : fields.path,
    JSON.stringify(fields.assets ?? []),
  )
}

beforeEach(() => {
  fixture = createSqliteD1(allMigrations())
  fixture.raw.prepare(`INSERT INTO repos (owner, repo, default_branch) VALUES ('owner', 'repo', 'trunk')`).run()
})

afterEach(() => {
  fixture.close()
})

describe('stored SKILL.md', () => {
  it('serves the stored body and names its source', async () => {
    seed({})
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillMd(skill, row!)).toEqual({
      _tag: 'ok',
      body: '# Stored body',
      source: 'owner/repo@trunk/skills/skill/SKILL.md',
    })
  })

  it('reports missing when no copy is stored', async () => {
    seed({ raw: null })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillMd(skill, row!)).toEqual({ _tag: 'missing' })
  })

  it('reports missing when the last render failed', async () => {
    seed({ status: 'error' })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillMd(skill, row!)).toEqual({ _tag: 'missing' })
  })

  it('reports gone over a stored body', async () => {
    seed({ resolved: 0 })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillMd(skill, row!)).toEqual({ _tag: 'gone' })
    expect(readStoredSkillFiles(row!)).toEqual({ _tag: 'gone' })
  })
})

describe('stored file list', () => {
  it('builds the payload from the stored assets', async () => {
    seed({ assets: [{ path: 'references/a.md', size: 10, type: 'markdown' }, { path: 'run.py', size: 5, type: 'code' }] })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillFiles(row!)).toEqual({
      _tag: 'ok',
      payload: {
        skillPath: 'skills/skill/SKILL.md',
        branch: 'trunk',
        files: [
          { path: 'references/a.md', size: 10, type: 'markdown' },
          { path: 'run.py', size: 5, type: 'code' },
        ],
        total: 2,
      },
    })
  })

  it('lists no files for a root SKILL.md, because the sync stores none', async () => {
    seed({ path: 'SKILL.md', assets: [] })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillFiles(row!)).toEqual({
      _tag: 'ok',
      payload: { skillPath: 'SKILL.md', branch: 'trunk', files: [], total: 0 },
    })
  })

  it('returns an empty list with no skillPath when nothing resolved', async () => {
    seed({ path: null, status: 'error' })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(readStoredSkillFiles(row!)).toEqual({
      _tag: 'ok',
      payload: { skillPath: null, branch: 'trunk', files: [], total: 0 },
    })
  })

  it('bounds a large list and reports the full count', async () => {
    const assets = Array.from({ length: 300 }, (_, i) => ({ path: `references/${i}.md`, size: 1, type: 'markdown' }))
    seed({ assets })
    const row = await loadStoredSkillRow(fixture.db, skill)
    const result = readStoredSkillFiles(row!)

    expect(result._tag === 'ok' && result.payload.files).toHaveLength(250)
    expect(result._tag === 'ok' && result.payload.total).toBe(300)
  })
})

describe('referenced file', () => {
  it('takes the directory from the stored path and reads one file', async () => {
    seed({})
    const row = await loadStoredSkillRow(fixture.db, skill)
    const target = resolveReferencedFileTarget(skill, row!, 'references/a.md')
    expect(target).toMatchObject({
      _tag: 'ok',
      url: 'https://raw.githubusercontent.com/owner/repo/trunk/skills/skill/references/a.md',
    })

    const fetchText = vi.fn().mockResolvedValue({ _tag: 'ok', body: '# A' })
    expect(await readReferencedFile(target as Extract<typeof target, { _tag: 'ok' }>, fetchText)).toEqual({ _tag: 'ok', body: '# A' })
    expect(fetchText).toHaveBeenCalledTimes(1)
  })

  it('resolves a root Skill file at the repository root', async () => {
    seed({ path: 'SKILL.md' })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(resolveReferencedFileTarget(skill, row!, 'a.md')).toMatchObject({
      url: 'https://raw.githubusercontent.com/owner/repo/trunk/a.md',
    })
  })

  it('reports missing when no SKILL.md path is stored', async () => {
    seed({ path: null })
    const row = await loadStoredSkillRow(fixture.db, skill)

    expect(resolveReferencedFileTarget(skill, row!, 'a.md')).toEqual({ _tag: 'missing' })
  })
})

import { describe, expect, it } from 'vitest'
import { selectSkillFiles, SKILL_FILE_LIMIT } from '../../shared/skill-files'

describe('skill file selection', () => {
  it('bounds a large file tree and reports the full count', () => {
    const files = Array.from({ length: SKILL_FILE_LIMIT + 1 }, (_, index) => ({
      path: `references/${index}.md`,
      size: index,
      type: 'markdown' as const,
    }))

    expect(selectSkillFiles(files)).toEqual({
      files: files.slice(0, SKILL_FILE_LIMIT),
      total: SKILL_FILE_LIMIT + 1,
    })
  })

  it('keeps shallow files over deep ones when the tree is over the limit', () => {
    // A root SKILL.md lists the whole repo, and the upstream tree is sorted by
    // path, so a plain slice kept deep `.github/` noise and dropped README.md.
    const deep = Array.from({ length: SKILL_FILE_LIMIT }, (_, index) => ({ path: `.github/workflows/${index}.yml` }))
    const files = [...deep, { path: 'README.md' }, { path: 'references/guide.md' }]

    const selected = selectSkillFiles(files)

    expect(selected.total).toBe(SKILL_FILE_LIMIT + 2)
    expect(selected.files).toHaveLength(SKILL_FILE_LIMIT)
    expect(selected.files.map(f => f.path)).toContain('README.md')
    expect(selected.files.map(f => f.path)).toContain('references/guide.md')
  })

  it('returns kept files in their original tree order', () => {
    const files = [{ path: 'b/deep/x.md' }, { path: 'a.md' }, { path: 'c/y.md' }]

    expect(selectSkillFiles(files)).toEqual({ files, total: 3 })
  })
})

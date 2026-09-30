import { describe, expect, it } from 'vitest'
import { resolveSkillZipEntries } from '../../layers/registry/app/utils/skill-zip'

describe('skill zip entries', () => {
  it('pins every file to the commit and roots the ZIP at the Skill folder', () => {
    expect(resolveSkillZipEntries({
      owner: 'anthropics',
      repo: 'skills',
      ref: '4e6907a',
      skillPath: 'skills/pdf/SKILL.md',
      name: 'pdf',
      files: [{ path: 'reference.md' }, { path: 'scripts/fill form.py' }],
    })).toEqual([
      { zipPath: 'pdf/SKILL.md', url: 'https://raw.githubusercontent.com/anthropics/skills/4e6907a/skills/pdf/SKILL.md' },
      { zipPath: 'pdf/reference.md', url: 'https://raw.githubusercontent.com/anthropics/skills/4e6907a/skills/pdf/reference.md' },
      { zipPath: 'pdf/scripts/fill form.py', url: 'https://raw.githubusercontent.com/anthropics/skills/4e6907a/skills/pdf/scripts/fill%20form.py' },
    ])
  })

  it('handles a Skill at the repository root', () => {
    expect(resolveSkillZipEntries({ owner: 'o', repo: 'r', ref: 'main', skillPath: 'SKILL.md', name: 'r', files: [] }))
      .toEqual([{ zipPath: 'r/SKILL.md', url: 'https://raw.githubusercontent.com/o/r/main/SKILL.md' }])
  })
})

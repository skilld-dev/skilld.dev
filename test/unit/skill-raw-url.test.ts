import { describe, expect, it } from 'vitest'
import { resolveSkillRawUrl } from '../../layers/registry/app/utils/skill-raw-url'

describe('skill raw URL', () => {
  it('keeps the registry raw endpoint for the root document', () => {
    expect(resolveSkillRawUrl({
      rootUrl: '/api/skills-raw/owner/repo/skill',
      skillFileUrl: 'https://github.com/owner/repo/blob/abc123/skills/skill/SKILL.md',
      activeDocPath: '',
    })).toBe('/api/skills-raw/owner/repo/skill')
  })

  it('opens the selected subdocument at the pinned source revision', () => {
    expect(resolveSkillRawUrl({
      rootUrl: '/api/skills-raw/owner/repo/skill',
      skillFileUrl: 'https://github.com/owner/repo/blob/abc123/skills/skill/SKILL.md',
      activeDocPath: 'references/setup guide.md',
    })).toBe('https://github.com/owner/repo/raw/abc123/skills/skill/references/setup%20guide.md')
  })
})

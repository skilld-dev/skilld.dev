import { describe, expect, it } from 'vitest'
import { skillsRawPathFromProbe } from '../../shared/skill-md-probe'

describe('skillsRawPathFromProbe', () => {
  it('resolves every layout an agent guesses to the same raw skill', () => {
    const layouts = [
      '/mattpocock/skills/main/skills/grill-me/SKILL.md',
      '/mattpocock/skills/main/grill-me/SKILL.md',
      '/mattpocock/skills/main/.claude/skills/grill-me/SKILL.md',
      '/mattpocock/skills/main/.agents/skills/grill-me/SKILL.md',
      '/mattpocock/skills/main/plugin/skills/grill-me/SKILL.md',
      '/mattpocock/skills/main/skills/productivity/grill-me/SKILL.md',
    ]
    for (const path of layouts)
      expect(skillsRawPathFromProbe(path), path).toBe('/api/skills-raw/mattpocock/skills/grill-me')
  })

  it('names a repo-root skill after its repository', () => {
    expect(skillsRawPathFromProbe('/expo/skills/main/SKILL.md')).toBe('/api/skills-raw/expo/skills/skills')
  })

  it('leaves anything that is not a raw layout probe alone', () => {
    expect(skillsRawPathFromProbe('/gh/mattpocock/skills/grill-me')).toBeNull()
    expect(skillsRawPathFromProbe('/api/skills-raw/a/b/c')).toBeNull()
    // Our own docs route, which really does serve a SKILL.md.
    expect(skillsRawPathFromProbe('/skills/skilld-registry/SKILL.md')).toBeNull()
    expect(skillsRawPathFromProbe('/mattpocock/SKILL.md')).toBeNull()
    expect(skillsRawPathFromProbe('/a//b/main/x/SKILL.md')).toBeNull()
  })
})

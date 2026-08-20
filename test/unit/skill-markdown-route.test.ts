import { describe, expect, it } from 'vitest'
import { skillIdentityFromGhPath } from '../../shared/skill-markdown-route'

describe('skillIdentityFromGhPath', () => {
  it('reads the identity out of a skill path', () => {
    expect(skillIdentityFromGhPath('/gh/anthropics/skills/canvas-design'))
      .toEqual({ owner: 'anthropics', repo: 'skills', name: 'canvas-design' })
    expect(skillIdentityFromGhPath('/gh/anthropics/skills/canvas-design/'))
      .toEqual({ owner: 'anthropics', repo: 'skills', name: 'canvas-design' })
  })

  it('declines anything that is not one skill', () => {
    expect(skillIdentityFromGhPath('/gh/anthropics')).toBeNull()
    expect(skillIdentityFromGhPath('/gh/anthropics/skills')).toBeNull()
    expect(skillIdentityFromGhPath('/gh/anthropics/skills/canvas-design/-/refs.md')).toBeNull()
    expect(skillIdentityFromGhPath('/skills/anthropics/skills/canvas-design')).toBeNull()
    expect(skillIdentityFromGhPath('/gh//skills/canvas-design')).toBeNull()
  })
})

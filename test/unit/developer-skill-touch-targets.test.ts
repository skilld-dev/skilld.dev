import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/components/DeveloperSkillSection.vue', 'utf8')
const skillsIndex = readFileSync('layers/marketing/app/pages/skills/index.vue', 'utf8')

describe('developer skill touch targets', () => {
  it('gives the consolidated maintainer identity a 44px target', () => {
    expect(source).toContain('class="group inline-flex min-h-11 max-w-full items-center')
    expect(source).not.toContain('View profile')
  })

  it('gives the consolidated official publisher identity a 44px target', () => {
    expect(skillsIndex).toContain('class="group inline-flex min-h-11 items-center gap-3"')
    expect(skillsIndex).not.toContain('View source')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/components/DeveloperSkillSection.vue', 'utf8')
const skillsIndex = readFileSync('layers/marketing/app/pages/skills/index.vue', 'utf8')

describe('developer skill touch targets', () => {
  it('gives the maintainer name and profile action 44px targets', () => {
    expect(source).toContain('class="inline-flex min-h-11 items-center')
    expect(source).toContain('class="min-h-11 self-start"')
  })

  it('gives official publisher avatar and name links 44px targets', () => {
    expect(skillsIndex).toContain('class="inline-flex size-11 shrink-0 items-center justify-center"')
    expect(skillsIndex).toContain('class="inline-flex min-h-11 items-center transition-colors hover:text-muted"')
  })
})

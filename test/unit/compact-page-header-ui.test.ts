import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const communitySource = readFileSync('app/pages/community/index.vue', 'utf8')
const leaderboardSource = readFileSync('layers/marketing/app/pages/skills/leaderboard.vue', 'utf8')
const skillsSource = readFileSync('layers/marketing/app/pages/skills/index.vue', 'utf8')

describe('compact registry page header', () => {
  it.each([
    ['Community', communitySource],
    ['Leaderboard', leaderboardSource],
    ['Skills', skillsSource],
  ])('replaces the %s masthead with the shared compact template', (title, source) => {
    expect(source).not.toContain('<EditorialMasthead')
    expect(source).toContain('<CompactPageHeader')
    expect(source).toContain(`title="${title}"`)
  })

  it('owns the semantic page heading and optional content slots', () => {
    const componentSource = readFileSync('app/components/CompactPageHeader.vue', 'utf8')

    expect(componentSource).toContain('<header class="compact-page-header">')
    expect(componentSource).toContain('<h1')
    expect(componentSource).toContain('<slot name="aside"')
    expect(componentSource).toContain('<slot />')
    expect(componentSource).toContain('label?: string')
    expect(componentSource).toContain('<p v-if="label" class="section-label">')
  })
})

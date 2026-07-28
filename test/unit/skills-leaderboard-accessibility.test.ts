import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const leaderboardSource = readFileSync(
  resolve(root, 'layers/marketing/app/pages/skills/leaderboard.vue'),
  'utf8',
)
const mainCss = readFileSync(resolve(root, 'app/assets/css/main.css'), 'utf8')

describe('skills leaderboard accessibility contract', () => {
  it('describes purpose review without claiming repository verification', () => {
    expect(leaderboardSource).toContain(`reviewed {{ data.total === 1 ? 'repo' : 'repos' }}`)
    expect(leaderboardSource).toContain('Purpose reviewed')
    expect(leaderboardSource).not.toContain('verified {{')
    expect(leaderboardSource).not.toContain('Skills-only repo')
  })

  it('exposes one loading status and hides visual skeleton rows', () => {
    expect(leaderboardSource).toContain(`role="status"
          aria-busy="true"`)
    expect(leaderboardSource).toContain(`class="leaderboard-row"
            aria-hidden="true"`)
  })

  it('keeps metric labels in the accessibility tree at every breakpoint', () => {
    expect(leaderboardSource).toContain('<span class="sr-only">Featured skill installs: </span>')
    expect(leaderboardSource).toContain('<span class="sr-only">Skill count: </span>')
    expect(leaderboardSource).toContain('<span class="sr-only">GitHub stars: </span>')
    expect(leaderboardSource).toContain(
      '<span class="leaderboard-row__mobile-label" aria-hidden="true">Skills</span>',
    )
    expect(leaderboardSource).toContain(
      '<span class="leaderboard-row__mobile-label" aria-hidden="true">Stars</span>',
    )
  })

  it('features the most popular skill within each repository row', () => {
    expect(leaderboardSource).toContain('item.topSkill.displayName')
    expect(leaderboardSource).toContain('item.topSkill.registryUrl')
    expect(leaderboardSource).toContain('Most popular skill')
    expect(leaderboardSource).toContain('leaderboard-row__featured')
    expect(leaderboardSource).toContain('container-type: inline-size')
    expect(leaderboardSource).toContain('min-h-11')
    expect(leaderboardSource).toContain(`.leaderboard-row__repository {
  grid-column: 2 / -1;`)
  })

  it('shows GitHub repository descriptions without exposing review rationale', () => {
    expect(leaderboardSource).toContain('item.description')
    expect(leaderboardSource).not.toContain('item.eligibilityReason')
  })

  it('shows the repository owner avatar without repeating adjacent link text', () => {
    expect(leaderboardSource).toContain(':src="item.avatarUrl"')
    expect(leaderboardSource).toContain('class="leaderboard-row__avatar"')
    expect(leaderboardSource).toContain('alt=""')
  })

  it('does not name generic containers', () => {
    expect(leaderboardSource).not.toContain('<div aria-labelledby="leaderboard-heading">')
  })

  it('keeps the cross-browser focus rule valid', () => {
    expect(mainCss).toContain(':focus-visible:not(input, textarea, select')
    expect(mainCss).not.toContain(':-moz-focusring')
  })
})

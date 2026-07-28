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
    expect(leaderboardSource).toContain(`reviewed {{ items.length === 1 ? 'repo' : 'repos' }}`)
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
    expect(leaderboardSource).toContain('<span class="sr-only">Skills: </span>')
    expect(leaderboardSource).toContain('<span class="sr-only">GitHub stars: </span>')
    expect(leaderboardSource).toContain(
      '<span class="leaderboard-row__mobile-label" aria-hidden="true">Skills</span>',
    )
    expect(leaderboardSource).toContain(
      '<span class="leaderboard-row__mobile-label" aria-hidden="true">Stars</span>',
    )
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

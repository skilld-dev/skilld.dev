import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillsSource = readFileSync('layers/marketing/app/pages/skills/index.vue', 'utf8')
const clusterSource = readFileSync('layers/marketing/app/pages/skills/[cluster].vue', 'utf8')
const frameworkSource = readFileSync('layers/marketing/app/pages/frameworks/_FrameworkSkillsDirectory.vue', 'utf8')

describe('discovery page cleanup', () => {
  it('keeps the skills opening and publisher sections free of repeated actions', () => {
    expect(skillsSource).not.toContain('label="Skill registry"')
    expect(skillsSource).not.toContain('to="/skills/official"')
    expect(skillsSource).not.toContain('label="View source"')
  })

  it('opens with the shared compact header and moves search down to the results', () => {
    // Same opening as /skills/leaderboard: header carries no controls.
    expect(skillsSource).toContain('heading-id="skills-heading"\n    />')
    expect(skillsSource).not.toContain('skills-search-shell')
    expect(skillsSource.indexOf('id="skill-search"'))
      .toBeGreaterThan(skillsSource.indexOf('heading-id="skills-heading"'))
  })

  it('exposes accessible registry controls', () => {
    expect(skillsSource).toContain('aria-label="Filter tags"')
    expect(skillsSource).toContain(':aria-pressed="sort === \'stars\'"')
    expect(skillsSource).toContain(':aria-pressed="sort === \'likes\'"')
    expect(skillsSource).toContain('Loading skills…')
  })

  it('lists results as one dense table instead of card views', () => {
    expect(skillsSource).toContain('<SkillTable')
    expect(skillsSource).not.toContain('<SkillCard')
    expect(skillsSource).not.toContain('view === \'grid\'')
  })

  it('uses the compact outcome opening with one back action', () => {
    expect(clusterSource).toContain('<CompactPageHeader')
    expect(clusterSource).not.toContain('<EditorialMasthead')
    expect(clusterSource).not.toContain('Browse every outcome')
    expect(clusterSource.match(/to="\/skills"/g)).toHaveLength(3)
  })

  it('uses one progressive framework directory without a contributor duplicate', () => {
    expect(frameworkSource).not.toContain('Top contributors')
    expect(frameworkSource).not.toContain('<main')
    expect(frameworkSource).toContain('visibleSkillCount')
    expect(frameworkSource).toContain('Show 24 more')
    expect(frameworkSource).toContain('aria-live="polite"')
    expect(frameworkSource).not.toContain('<span class="section-label">Framework</span>')
  })

  it('keeps headings out of phrasing-only containers', () => {
    expect(skillsSource).not.toContain('<span class="min-w-0">\n                    <h3')
  })
})

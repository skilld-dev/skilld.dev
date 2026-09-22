import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const design = readFileSync('DESIGN.md', 'utf8')

function componentRules(): string {
  const start = design.indexOf('## Component Rules')
  const next = design.indexOf('\n## ', start)
  return design.slice(start, next)
}

describe('component rules (DESIGN.md)', () => {
  it('binds InstallCommand and SkillSourceList in the Component Rules section', () => {
    const rules = componentRules()
    expect(rules).toContain('InstallCommand')
    expect(rules).toContain('SkillSourceList')
  })
})

describe('noise field identity pointer (DESIGN.md)', () => {
  it('claims the noise field identity spec in this section, not COPY.md', () => {
    const specLines = design.split('\n').filter(line => line.includes('identity spec'))
    expect(specLines.length).toBeGreaterThan(0)
    expect(specLines.filter(line => line.includes('COPY.md'))).toEqual([])
  })
})

describe('docs/work brief citations', () => {
  it('cites the pivot plan at its new path, never the deleted root file', () => {
    const briefs = readdirSync('docs/work').filter(file => file.endsWith('.md'))
    const dangling = briefs.filter((file) => {
      const lines = readFileSync(join('docs/work', file), 'utf8').split('\n')
      const cites = lines.filter(line => line.includes('PIVOT_PLAN') && !(line.includes('moved') && line.includes('`PIVOT_PLAN.md`')))
      return cites.length > 0
    })
    expect(dangling).toEqual([])
  })
})

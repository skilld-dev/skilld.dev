import { describe, expect, it } from 'vitest'
import { resolveSkillContextChecks } from '../../layers/registry/app/utils/skill-context-checks'

const source = (frontmatter: Record<string, unknown> | null) => ({ raw: 'source', frontmatter })

describe('skill context checks', () => {
  it('counts the rendered Claude row and flags strictly above 1% of the example allowance', () => {
    const atLimit = resolveSkillContextChecks(source({ name: 'x', description: 'a'.repeat(76) }))
    const above = resolveSkillContextChecks(source({ name: 'x', description: 'a'.repeat(77) }))
    expect(atLimit.claudeListing).toEqual({ _tag: 'listed', characters: 80, percent: 1 })
    expect(atLimit.checks).toEqual([])
    expect(above.checks.map(check => check.code)).toEqual(['listing-share'])
  })

  it('caps Unicode descriptions by characters and includes when_to_use for Claude', () => {
    const result = resolveSkillContextChecks(source({ name: 'x', description: '😀'.repeat(1025), when_to_use: 'b'.repeat(512) }))
    expect(result.checks.map(check => check.code)).toEqual(['codex-description-cap', 'claude-description-cap', 'listing-share'])
    expect(result.claudeListing).toEqual({ _tag: 'listed', characters: 1540, percent: 19.25 })
  })

  it('keeps explicit-only Claude Skills out of the listing estimate', () => {
    const result = resolveSkillContextChecks(source({ 'name': 'x', 'description': 'a'.repeat(2000), 'disable-model-invocation': true }))
    expect(result.claudeListing).toEqual({ _tag: 'explicit-only' })
    expect(result.checks.map(check => check.code)).toEqual(['codex-description-cap'])
  })

  it('reports missing or invalid source metadata without counting repository fallback text', () => {
    expect(resolveSkillContextChecks(source(null)).checks.map(check => check.code)).toEqual(['frontmatter'])
    const invalid = resolveSkillContextChecks(source({ name: 5, description: ['not a string'] }))
    expect(invalid.checks.map(check => check.code)).toEqual(['name', 'description'])
    expect(invalid.claudeListing).toEqual({ _tag: 'unavailable' })
  })

  it('does not report source defects while the source is unavailable', () => {
    expect(resolveSkillContextChecks({ raw: null, frontmatter: null })).toEqual({ checks: [], claudeListing: { _tag: 'unavailable' } })
  })
})

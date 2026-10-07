import { describe, expect, it } from 'vitest'
import { comparisonSchema } from '../../layers/marketing/shared/comparison'

function comparison() {
  const revision = 'a'.repeat(40)
  return {
    targetQuery: 'humanize writing skills',
    reviewedAt: '2026-10-05',
    reviewDueAt: '2027-01-05',
    scope: 'Prose editing Skills',
    methodology: 'source-review',
    disclosure: 'Agent source review.',
    sources: ['first', 'second'].map(name => ({
      selector: `writer/skills/${name}`,
      revision,
      url: `https://github.com/writer/skills/blob/${revision}/${name}/SKILL.md`,
    })),
  }
}

describe('comparison evidence', () => {
  it('accepts a dated source review with pinned Skill links', () => {
    const input = comparison()
    expect(comparisonSchema.parse(input)).toEqual(input)
  })

  it.each([
    ['missing evidence', (input: ReturnType<typeof comparison>) => ({ ...input, sources: [] })],
    ['invalid URL', (input: ReturnType<typeof comparison>) => ({ ...input, sources: [{ ...input.sources[0], url: 'invalid' }, input.sources[1]] })],
    ['moving source', (input: ReturnType<typeof comparison>) => ({ ...input, sources: [{ ...input.sources[0], url: 'https://github.com/writer/skills/blob/main/first/SKILL.md' }, input.sources[1]] })],
    ['moving source after path normalization', (input: ReturnType<typeof comparison>) => ({ ...input, sources: [{ ...input.sources[0], url: `https://github.com/writer/skills/blob/${input.sources[0].revision}/%2e%2e/main/first/SKILL.md` }, input.sources[1]] })],
    ['wrong repository', (input: ReturnType<typeof comparison>) => ({ ...input, sources: [{ ...input.sources[0], selector: 'other/skills/first' }, input.sources[1]] })],
    ['duplicate Skill', (input: ReturnType<typeof comparison>) => ({ ...input, sources: [input.sources[0], input.sources[0]] })],
    ['expired deadline', (input: ReturnType<typeof comparison>) => ({ ...input, reviewDueAt: '2026-10-04' })],
  ])('rejects %s', (_name, change) => {
    expect(comparisonSchema.safeParse(change(comparison())).success).toBe(false)
  })
})

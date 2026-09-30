import { describe, expect, it } from 'vitest'
import { formatByteSize, formatTokenCount, resolveSkillContextCost } from '../../layers/registry/app/utils/skill-context-cost'

describe('skill context cost', () => {
  it('splits tokens by loading stage and keeps scripts and images out of context', () => {
    const raw = `---\nname: pdf\ndescription: Read PDFs\n---\n\n${'a'.repeat(400)}\n`
    const cost = resolveSkillContextCost({
      raw,
      name: 'pdf',
      description: 'Read PDFs',
      files: [
        { path: 'reference.md', size: 800, type: 'markdown' },
        { path: 'schema.json', size: 200, type: 'data' },
        { path: 'scripts/fill.py', size: 4000, type: 'code' },
        { path: 'logo.png', size: 9000, type: 'image' },
      ],
    })

    expect(cost.tokens).toEqual({ metadata: 4, instructions: 100, resources: 250 })
    expect(cost.fileCount).toBe(5)
    expect(cost.totalBytes).toBe(raw.length + 14000)
  })

  it('counts a Skill with no source and no files as SKILL.md alone', () => {
    const cost = resolveSkillContextCost({ raw: null, name: 'x', description: null, files: [] })

    expect(cost).toEqual({ fileCount: 1, totalBytes: 0, tokens: { metadata: 1, instructions: 0, resources: 0 } })
  })

  it('formats counts for the chips', () => {
    expect(formatTokenCount(111)).toBe('≈111')
    expect(formatTokenCount(1900)).toBe('≈1.9k')
    expect(formatTokenCount(2000)).toBe('≈2k')
    expect(formatTokenCount(18_400)).toBe('≈18k')
    expect(formatByteSize(631)).toBe('631 B')
    expect(formatByteSize(58_675)).toBe('57.3 KB')
  })
})

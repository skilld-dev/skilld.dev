import { describe, expect, it } from 'vitest'
import { normalizeSkillAssetFilePath } from '../../shared/skill-asset-path'

describe('skill asset path normalization', () => {
  it('collapses a stale relative registry link duplicated into the asset path', () => {
    expect(normalizeSkillAssetFilePath({
      owner: 'harlan-zw',
      repo: 'harlan-agent-kit',
      name: 'improve-ts-pkg-architecture',
      filePath: 'gh/harlan-zw/harlan-agent-kit/improve-ts-pkg-architecture/-/PKG-CONVENTIONS.md',
    })).toBe('PKG-CONVENTIONS.md')
  })

  it('leaves legitimate nested files unchanged', () => {
    expect(normalizeSkillAssetFilePath({
      owner: 'acme',
      repo: 'skills',
      name: 'review',
      filePath: 'references/checklist.md',
    })).toBe('references/checklist.md')
  })
})

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

  it('collapses the duplicated prefix when the link carries the repository own casing', () => {
    expect(normalizeSkillAssetFilePath({
      owner: 'microsoft',
      repo: 'github-copilot-for-azure',
      name: 'markdown-token-optimizer',
      filePath: 'gh/microsoft/GitHub-Copilot-for-Azure/markdown-token-optimizer/-/references/ANTI-PATTERNS.md',
    })).toBe('references/ANTI-PATTERNS.md')
  })

  it('keeps a nested file whose leading segments only resemble the prefix', () => {
    expect(normalizeSkillAssetFilePath({
      owner: 'acme',
      repo: 'skills',
      name: 'review',
      filePath: 'gh/acme/skills/review/checklist.md',
    })).toBe('gh/acme/skills/review/checklist.md')
  })
})

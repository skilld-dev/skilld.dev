import { describe, expect, it } from 'vitest'
import { isSkillFilePagePath, normalizeSkillAssetFilePath } from '../../shared/skill-asset-path'

describe('skill asset path normalization', () => {
  it('collapses a stale relative registry link duplicated into the asset path', () => {
    expect(normalizeSkillAssetFilePath({
      owner: 'harlan-zw',
      repo: 'harlan-agent-kit',
      name: 'improve-ts-pkg-architecture',
      filePath: 'gh/harlan-zw/harlan-agent-kit/improve-ts-pkg-architecture/-/PKG-CONVENTIONS.md',
    })).toBe('PKG-CONVENTIONS.md')
  })

  it('collapses a duplicated prefix that kept the upstream repository casing', () => {
    // The route segments are the lowercase registry slug, while the stale link
    // carried GitHub's own casing. An exact comparison missed that, so the
    // whole `/gh/.../-/` prefix stayed in the upstream path and every fetch
    // 502'd as `Could not fetch asset`.
    expect(normalizeSkillAssetFilePath({
      owner: 'microsoft',
      repo: 'github-copilot-for-azure',
      name: 'markdown-token-optimizer',
      filePath: 'gh/microsoft/GitHub-Copilot-for-Azure/markdown-token-optimizer/-/references/ANTI-PATTERNS.md',
    })).toBe('references/ANTI-PATTERNS.md')
  })

  it('leaves legitimate nested files unchanged', () => {
    expect(normalizeSkillAssetFilePath({
      owner: 'acme',
      repo: 'skills',
      name: 'review',
      filePath: 'references/checklist.md',
    })).toBe('references/checklist.md')
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

describe('isSkillFilePagePath', () => {
  it.each([
    '/gh/anthropics/skills/pdf/-/reference.md',
    '/gh/anthropics/skills/pdf/-/scripts/check_bounding_boxes.py',
    '/gh/anthropics/skills/pdf/-/LICENSE.txt?ref=main',
  ])('claims the Skill file URL %s', (path) => {
    expect(isSkillFilePagePath(path)).toBe(true)
  })

  it.each([
    // The Skill page and its Markdown twin stay with nuxt-ai-ready.
    '/gh/anthropics/skills/pdf',
    '/gh/anthropics/skills/pdf.md',
    '/gh/anthropics/skills/pdf/-/',
    '/gh/anthropics/skills.md',
    '/api/skill-asset/anthropics/skills/pdf/reference.md',
  ])('leaves %s alone', (path) => {
    expect(isSkillFilePagePath(path)).toBe(false)
  })
})

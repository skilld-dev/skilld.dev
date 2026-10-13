import { describe, expect, it } from 'vitest'
import { resolveSkillContextChecks } from '../../layers/registry/app/utils/skill-context-checks'
import { resolveSkillContextCost } from '../../layers/registry/app/utils/skill-context-cost'
import { skillDetailPayload } from '../../layers/registry/app/utils/skill-detail-payload'

const detail = {
  raw: '---\nname: chrome\ndescription: Browser rules.\n---\n# Chrome\nRead before running. é',
  frontmatter: { name: 'chrome', description: 'Browser rules.' },
  name: 'chrome',
  description: 'Browser rules.',
  sourceGone: false,
  assets: [{ path: 'references/browser.md', size: 2048, type: 'markdown' as const }],
  contentHtml: '<h1>Chrome</h1><p>Read before running. é</p>',
}

describe('skill detail payload', () => {
  it('keeps rendered content, source controls and exact summaries without duplicate Markdown', () => {
    const result = skillDetailPayload(detail)
    expect(result.raw).toBeNull()
    expect(result.contentHtml).toBe(detail.contentHtml)
    expect(result.sourceView).toEqual({
      hasRaw: true,
      bytes: new TextEncoder().encode(detail.raw).byteLength,
      cost: resolveSkillContextCost({ ...detail, files: detail.assets }),
      checks: resolveSkillContextChecks(detail),
    })
  })

  it('keeps the saved source when GitHub no longer has the Skill', () => {
    expect(skillDetailPayload({ ...detail, sourceGone: true }).raw).toBe(detail.raw)
  })
})

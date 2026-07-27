import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('server/api/feed/recent-updates.get.ts', 'utf8')

describe('recent update provenance', () => {
  it('limits updates to curated skills with revision-backed context', () => {
    expect(source).toMatch(/LEFT JOIN skill_revisions revisions/)
    expect(source).toMatch(/s\.is_abstract = 1 AND s\.is_official = 1/)
    expect(source).toContain('changeSummary')
  })
})

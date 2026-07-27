import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('layers/marketing/app/pages/skills/tag/[slug].vue', 'utf8')

describe('tag page data contract', () => {
  it('bypasses canonical tag redirects for its internal profile request', () => {
    expect(source).toContain('?view=data')
  })

  it('rejects an unexpected profile shape before reading the tag', () => {
    expect(source).toContain('!data.value?.tag')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync('app/pages/community/index.vue', 'utf8')

describe('community page opening', () => {
  it('opens with a compact semantic directory header instead of a hero', () => {
    expect(pageSource).not.toContain('<EditorialMasthead')
    expect(pageSource).not.toContain('data-palette="rose"')
    expect(pageSource).toContain('<CompactPageHeader')
    expect(pageSource).toContain('title="Community"')
  })

  it('keeps publishing and filtering actions in the compact opening', () => {
    expect(pageSource.match(/label="Publish a collection"/g)).toHaveLength(1)
    expect(pageSource).toContain('aria-label="Filter community creators"')
    expect(pageSource).toContain('role="search"')
    expect(pageSource).not.toContain('<search')
  })

  it('uses the opening CTA instead of repeating it in a closing band', () => {
    expect(pageSource).not.toContain('community-cta-heading')
    expect(pageSource).not.toContain('Add your work to the community')
    expect(pageSource).not.toContain('editorial-atmosphere')
  })
})

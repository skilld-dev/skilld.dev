import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  'layers/registry/server/api/skills/[...slug].get.ts',
  'utf8',
)

describe('skill detail cache reads', () => {
  it('does not make the retired endorsement cache a request dependency', () => {
    expect(source).not.toContain('ENDORSEMENTS_CACHE_KEY')
    expect(source).not.toContain('useStorage(\'cache\').getItem')
  })
})

import { describe, expect, it } from 'vitest'
import { resolveAuthorName } from '../../app/utils/skill-byline'

describe('resolveAuthorName', () => {
  it('returns the synced profile name', () => {
    expect(resolveAuthorName('antfu', 'Anthony Fu')).toBe('Anthony Fu')
  })

  it('collapses stray whitespace', () => {
    expect(resolveAuthorName('antfu', '  Anthony   Fu ')).toBe('Anthony Fu')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['blank', '   '],
    ['login echoed as name', 'hyf0'],
    ['login in another case', 'HYF0'],
  ])('falls back to the slug when the name is %s', (_, name) => {
    expect(resolveAuthorName('hyf0', name)).toBeNull()
  })
})

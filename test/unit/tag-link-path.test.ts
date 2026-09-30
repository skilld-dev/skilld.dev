// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { tagLinkPath } from '../../layers/registry/server/utils/tag-quality'

describe('tagLinkPath', () => {
  it('links a redirected tag to its final page', () => {
    expect(tagLinkPath('performance')).toBe('/skills/performance')
    expect(tagLinkPath('security')).toBe('/skills/backend-data')
  })

  it('links a plain tag to its own page', () => {
    expect(tagLinkPath('rust')).toBe('/skills/tag/rust')
  })
})

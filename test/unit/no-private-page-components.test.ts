import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('page directory boundaries', () => {
  it('does not expose CollectionAvatar as a generated page route', () => {
    expect(existsSync('app/pages/collections/_CollectionAvatar.vue')).toBe(false)
  })
})

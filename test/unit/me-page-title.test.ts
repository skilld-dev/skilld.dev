// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('layers/identity/app/pages/me/index.vue', 'utf8')

describe('dashboard page title', () => {
  it('leaves the global title template to add the site suffix once', () => {
    expect(source).toContain('title: \'Your dashboard\'')
    expect(source).not.toContain('title: \'Your dashboard · skilld\'')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('layers/identity/app/pages/login.vue', 'utf8')

describe('login page title', () => {
  it('leaves the global title template to add the site suffix once', () => {
    expect(source).toContain('title: \'Sign in\'')
    expect(source).not.toContain('title: \'Sign in · skilld\'')
  })
})

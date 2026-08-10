import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('@nuxtjs/mdc runtime package', () => {
  it('ships the renderer registered by its Nuxt module', () => {
    const moduleEntry = require.resolve('@nuxtjs/mdc')
    const renderer = resolve(dirname(moduleEntry), 'runtime/components/MDCRenderer.vue')

    expect(existsSync(renderer), `Missing published runtime component: ${renderer}`).toBe(true)
  })
})

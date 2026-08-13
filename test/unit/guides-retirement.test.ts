import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('guides retirement', () => {
  it('removes the guides layer and serves its public routes as gone', () => {
    const nuxtConfig = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')
    const middleware = readFileSync(resolve(root, 'server/middleware/guides-gone.ts'), 'utf8')

    expect(existsSync(resolve(root, 'layers/guides'))).toBe(false)
    expect(existsSync(resolve(root, 'scripts/ingest-guides.ts'))).toBe(false)
    expect(nuxtConfig).not.toContain('\'./layers/guides\'')
    expect(nuxtConfig).not.toContain('/api/__sitemap__/npm-guides')
    expect(middleware).toContain('statusCode: 410')
    expect(middleware).toContain('pathname.startsWith(\'/guides/\')')
  })

  it('keeps the npm_guides data for a later migration', () => {
    const migration = readFileSync(resolve(root, 'migrations/0060_npm_guides.sql'), 'utf8')
    expect(migration).toContain('CREATE TABLE npm_guides')
  })

  it('removes guide-only styling and configuration references', () => {
    const css = readFileSync(resolve(root, 'app/assets/css/main.css'), 'utf8')
    const nuxtConfig = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')

    expect(css).not.toContain('.mdxg-guide')
    expect(css).not.toContain('--mdxg-color-')
    expect(css).not.toContain('Migration guides render')
    expect(nuxtConfig).not.toContain('npm migration guides')
    expect(nuxtConfig).not.toContain('dominant lang in the guides')
  })
})

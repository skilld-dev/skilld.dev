import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withBuildAssetMissFallthrough } from '../../scripts/lib/static-asset-fallthrough'

describe('static asset cache policy', () => {
  it('uses a fresh namespace with a bounded Cloudflare edge TTL', () => {
    const config = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')

    expect(config).toContain('buildAssetsDir: \'/_nuxt/v2/\'')
    expect(config).toContain('\'/_nuxt/v2/**\'')
    expect(config).toMatch(/'\/_nuxt\/v2\/\*\*': \{[\s\S]*?'cache-control': 'public, max-age=31536000, immutable'/)
    expect(config).toContain('\'cloudflare-cdn-cache-control\': \'max-age=60\'')
    expect(config).toContain('basePath: \'/__skew\'')
  })

  it('lets missing build assets reach the Worker without changing other asset roots', () => {
    const assets = withBuildAssetMissFallthrough([
      { baseURL: '/_nuxt/v2/', fallthrough: false },
      { baseURL: '/images/', fallthrough: false },
    ], '/_nuxt/v2/')

    expect(assets).toEqual([
      { baseURL: '/_nuxt/v2/', fallthrough: true },
      { baseURL: '/images/', fallthrough: false },
    ])
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('static asset cache policy', () => {
  it('uses a fresh namespace with a bounded Cloudflare edge TTL', () => {
    const config = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')

    expect(config).toContain('buildAssetsDir: \'/_nuxt/v2/\'')
    expect(config).toContain('\'/_nuxt/v2/**\'')
    expect(config).toContain('\'cloudflare-cdn-cache-control\': \'max-age=60\'')
  })
})

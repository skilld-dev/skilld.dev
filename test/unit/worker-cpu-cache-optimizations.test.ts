import { createApp, defineEventHandler, getRequestURL, toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { canReuseStoredSkillHtml } from '../../layers/registry/server/utils/skill-md-render'
import { isStaticProbe404Path } from '../../shared/static-probe-404'

const globals = globalThis as Record<string, unknown>
globals.defineNuxtConfig ??= (config: unknown) => config

vi.mock('node:url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:url')>()
  return {
    ...actual,
    fileURLToPath: (url: URL | string) => {
      try {
        return actual.fileURLToPath(url)
      }
      catch {
        return typeof url === 'string' ? url : url.href
      }
    },
  }
})

interface RouteRule {
  headers?: Record<string, string>
}

const config = await import('../../nuxt.config') as {
  default: {
    routeRules?: Record<string, RouteRule>
  }
}

describe('worker CPU and edge cache rules', () => {
  it('caches content-hashed /_nuxt/v2/** assets immutably at the Cloudflare edge', () => {
    const rule = config.default.routeRules?.['/_nuxt/v2/**']
    expect(rule?.headers?.['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(rule?.headers?.['cloudflare-cdn-cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('edge-caches Skill file deep links (/gh/:owner/:repo/:name/-/**)', () => {
    const rule = config.default.routeRules?.['/gh/:owner/:repo/:name/-/**']
    expect(rule?.headers?.['cloudflare-cdn-cache-control']).toContain('public')
    expect(rule?.headers?.['cloudflare-cdn-cache-control']).toContain('max-age=300')
    expect(rule?.headers?.['cloudflare-cdn-cache-control']).toContain('stale-while-revalidate=3600')
  })
})

describe('static and scanner 404 probe matcher', () => {
  it.each([
    '/wp-content/uploads/2023/02/logo.png',
    '/wp-admin/install.php',
    '/wp-includes/js/jquery.js',
    '/wp-login.php',
    '/xmlrpc.php',
    '/.env',
    '/.env.local',
    '/.git/config',
    '/images/01.jpg',
    '/favicon.png',
    '/favicon.ico.png',
    '/assets/index/favicon.ico',
    '/main.c6d13be3ea6fc9cb.js',
    '/assets/GanjingAbout-Cb73sJYd.js',
    '/static/icon/bjch.png',
  ])('identifies %s as a static/scanner probe', (path) => {
    expect(isStaticProbe404Path(path)).toBe(true)
  })

  it.each([
    '/',
    '/skills',
    '/gh/owner/repo/skill',
    '/gh/owner/repo/skill.md',
    '/gh/owner/repo/skill/-/scripts/run.js',
    '/gh/owner/repo/skill/-/reference/guide.md',
    '/_img/avatar',
    '/_og/d/image.png',
    '/_og/s/image.png',
    '/_og/r/abc.png',
    '/_og-static-fonts/inter-400-latin.ttf',
    '/_nuxt/v2/entry.css',
    '/_nuxt-skew-sw.js',
    '/_scripts/assets/637381256384554e.js',
    '/_file-icons/file-type-markdown.svg',
    '/api/v1/openapi.json',
    '/b/harlan-zw/nuxt-seo',
    '/repos/mrdoob/three.js',
    '/repos/animate-css/animate.css',
    '/sitemap_index.xml',
    '/robots.txt',
    '/llms.txt',
    '/agent.md',
    '/install.sh',
    '/install.ps1',
    '/.well-known/api-catalog',
  ])('never intercepts valid or dynamic path %s', (path) => {
    expect(isStaticProbe404Path(path)).toBe(false)
  })

  it('answers probe requests with a cacheable plain-text 404 before SSR', async () => {
    const middleware = (await import('../../server/middleware/static-probe-404')).default
    const app = createApp()
    app.use(middleware)
    app.use(defineEventHandler(() => 'passed'))
    const handle = toWebHandler(app)

    const probe = await handle(new Request('http://localhost/wp-content/uploads/logo.png'))
    expect(probe.status).toBe(404)
    expect(probe.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(probe.headers.get('x-robots-tag')).toBe('noindex')
    expect(probe.headers.get('cache-control')).toBe('no-store')
    expect(probe.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
    expect(await probe.text()).toBe('Not found')

    const post = await handle(new Request('http://localhost/wp-login.php', { method: 'POST' }))
    expect(post.status).toBe(200)
    expect(await post.text()).toBe('passed')

    const page = await handle(new Request('http://localhost/skills/trending'))
    expect(page.status).toBe(200)
    expect(await page.text()).toBe('passed')
  })

  it('sets a short edge TTL on gh-legacy-skill-redirect plain-text 404s', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('getRequestURL', getRequestURL)
    const middleware = (await import('../../layers/registry/server/middleware/gh-legacy-skill-redirect')).default
    const app = createApp()
    app.use(middleware)
    app.use(defineEventHandler(() => 'passed'))
    const handle = toWebHandler(app)

    const res = await handle(new Request('http://localhost/gh/www.thriftbooks.com%20on%20skilld'))
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
  })
})

describe('fast plain-text 410 gone middleware', () => {
  it('answers /people/* with plain-text 410 and keeps /people/harlanzw.com redirecting 301', async () => {
    const middleware = (await import('../../server/middleware/people-gone')).default
    const app = createApp()
    app.use(middleware)
    app.use(defineEventHandler(() => 'passed'))
    const handle = toWebHandler(app)

    const gone = await handle(new Request('http://localhost/people/someone.bsky.social'))
    expect(gone.status).toBe(410)
    expect(gone.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(gone.headers.get('x-robots-tag')).toBe('noindex')
    expect(gone.headers.get('cache-control')).toBe('no-store')
    expect(gone.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
    expect(await gone.text()).toBe('Gone')

    const head = await handle(new Request('http://localhost/people', { method: 'HEAD' }))
    expect(head.status).toBe(410)
    expect(head.headers.get('x-robots-tag')).toBe('noindex')
    expect(head.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
    expect(await head.text()).toBe('')

    const post = await handle(new Request('http://localhost/people/foo', { method: 'POST' }))
    expect(post.status).toBe(410)
    expect(post.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')

    const redirect = await handle(new Request('http://localhost/people/harlanzw.com'))
    expect(redirect.status).toBe(301)
    expect(redirect.headers.get('location')).toBe('/@harlanzw')

    const redirectSlash = await handle(new Request('http://localhost/people/harlanzw.com/'))
    expect(redirectSlash.status).toBe(301)
    expect(redirectSlash.headers.get('location')).toBe('/@harlanzw')

    const other = await handle(new Request('http://localhost/skills'))
    expect(other.status).toBe(200)
    expect(await other.text()).toBe('passed')
  })

  it('answers /guides and /guides/* with plain-text 410 before SSR', async () => {
    const middleware = (await import('../../server/middleware/guides-gone')).default
    const app = createApp()
    app.use(middleware)
    app.use(defineEventHandler(() => 'passed'))
    const handle = toWebHandler(app)

    for (const path of ['/guides', '/guides/npm/example']) {
      const res = await handle(new Request(`http://localhost${path}`))
      expect(res.status).toBe(410)
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(res.headers.get('x-robots-tag')).toBe('noindex')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
      expect(await res.text()).toBe('This guide is no longer available.')
    }

    const head = await handle(new Request('http://localhost/guides/npm/example', { method: 'HEAD' }))
    expect(head.status).toBe(410)
    expect(head.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
    expect(await head.text()).toBe('')

    const other = await handle(new Request('http://localhost/skills/guide'))
    expect(other.status).toBe(200)
    expect(await other.text()).toBe('passed')
  })

  it('answers retired collections with plain-text 410 before SSR', async () => {
    const middleware = (await import('../../server/middleware/retired-collections')).default
    const app = createApp()
    app.use(middleware)
    app.use(defineEventHandler(() => 'passed'))
    const handle = toWebHandler(app)

    for (const path of ['/@harlan-zw/apple-apps', '/%40harlan-zw/knowledge-workspace/']) {
      const res = await handle(new Request(`http://localhost${path}`))
      expect(res.status).toBe(410)
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(res.headers.get('x-robots-tag')).toBe('noindex')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300')
      expect(await res.text()).toBe('Gone')
    }

    const head = await handle(new Request('http://localhost/@harlan-zw/apple-apps', { method: 'HEAD' }))
    expect(head.status).toBe(410)
    expect(await head.text()).toBe('')

    const live = await handle(new Request('http://localhost/@harlan-zw/agent-building-stack'))
    expect(live.status).toBe(200)
    expect(await live.text()).toBe('passed')
  })
})

describe('skill-file-page Vary header', () => {
  it('adds Vary: Host on Skill file deep links so apex and www stay isolated in edge cache', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    const handler = (await import('../../server/handlers/skill-file-page')).default
    const app = createApp()
    app.use(handler)
    app.use(defineEventHandler(() => 'ok'))
    const handle = toWebHandler(app)

    const fileRes = await handle(new Request('http://localhost/gh/owner/repo/skill/-/reference/guide.md'))
    expect(fileRes.headers.get('vary')).toContain('Host')

    const normalRes = await handle(new Request('http://localhost/gh/owner/repo/skill'))
    expect(normalRes.headers.get('vary')).toBeNull()
  })
})

describe('canReuseStoredSkillHtml', () => {
  const base = {
    raw: '---\nname: alpha\n---\n\n# Alpha\n\nPlain body with ```ts\nconst x = 1\n```.',
    html: '<h2>Alpha</h2><pre tabindex="0" class="rangi"><code>const x = 1</code></pre>',
    frontmatter: '{"name":"alpha"}',
    sourceResolved: 1,
    skillNames: ['alpha', 'beta'],
    currentSkill: 'alpha',
  }

  it('reuses stored HTML when frontmatter, pre tabindex, images, source, and sibling refs are clean', () => {
    expect(canReuseStoredSkillHtml(base)).toBe(true)
  })

  it('re-parses when rendered_frontmatter is missing', () => {
    expect(canReuseStoredSkillHtml({ ...base, frontmatter: null })).toBe(false)
  })

  it('re-parses when the upstream source is gone so relative links are stripped', () => {
    expect(canReuseStoredSkillHtml({ ...base, sourceResolved: 0 })).toBe(false)
  })

  it('re-parses when raw markdown contains images needing request-time proxy signing', () => {
    expect(canReuseStoredSkillHtml({ ...base, raw: '![diagram](https://example.com/a.png)' })).toBe(false)
  })

  it('re-parses when raw markdown references a sibling Skill in the same repository', () => {
    expect(canReuseStoredSkillHtml({ ...base, raw: 'Run `/beta` first.' })).toBe(false)
  })

  it('ignores self-references when deciding whether to re-parse', () => {
    expect(canReuseStoredSkillHtml({ ...base, raw: 'Run `/alpha` directly.' })).toBe(true)
  })

  it('re-parses when stored HTML has legacy <pre> markup without tabindex="0"', () => {
    expect(canReuseStoredSkillHtml({ ...base, html: '<pre><code>x</code></pre>' })).toBe(false)
  })
})

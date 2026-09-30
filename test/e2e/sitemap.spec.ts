import { CLUSTERS } from '../../layers/registry/server/data/clusters'
import { expect, test } from './test-utils'

test.describe('multi-sitemap', () => {
  test('sitemap index lists all child sitemaps', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/sitemap_index.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()

    for (const name of ['pages', 'skills', 'authors', 'sources']) {
      expect(xml).toContain(`/__sitemap__/${name}.xml`)
    }
  })

  test('pages sitemap excludes dynamic routes', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/__sitemap__/pages.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()

    expect(xml).toContain('/accessibility')
    expect(xml).not.toMatch(/<loc>[^<]*\/skills\/[^<]+<\/loc>/)
    expect(xml).not.toMatch(/<loc>[^<]*\/@[^<]+<\/loc>/)
  })

  test('skills sitemap returns valid entries', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/__sitemap__/skills.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()

    expect(xml).toContain('<loc>')
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), m => new URL(m[1]!).pathname)
    expect(locs.length).toBeGreaterThan(0)
    const outcomeLocs = CLUSTERS.map(cluster => `/skills/${cluster.slug}`)
    expect(locs.filter(loc => outcomeLocs.includes(loc))).toEqual(outcomeLocs)
    for (const loc of locs)
      expect(loc).toMatch(/^\/(?:gh\/|skills\/(?:plan|master-agent|docs|review|debug|ship)$)/)
  })

  test('authors and sources sitemaps are gone', async ({ page, baseURL }) => {
    for (const name of ['authors', 'sources']) {
      const res = await page.request.get(`${baseURL}/__sitemap__/${name}.xml`)
      expect(res.status()).toBe(404)
    }
  })

  test('the index lists no sitemap for noindex pages, and robots.txt lists only the index', async ({ page, baseURL }) => {
    const index = await (await page.request.get(`${baseURL}/sitemap_index.xml`)).text()
    expect(index).not.toMatch(/__sitemap__\/(?:authors|sources)\.xml/)

    const robots = await (await page.request.get(`${baseURL}/robots.txt`)).text()
    const lines = robots.split('\n').filter(line => /^sitemap:/i.test(line))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('/sitemap_index.xml')
  })
})

test.describe('entity pages stay out of the index', () => {
  const noindexPaths = [
    '/@harlan-zw',
    '/@harlan-zw/design-engineering-essentials',
    '/gh/anthropics',
    '/gh/antfu/skills',
  ]
  for (const path of noindexPaths) {
    test(`${path} is noindex,follow in meta and header`, async ({ page, baseURL }) => {
      const res = await page.request.get(`${baseURL}${path}`)
      const html = await res.text()
      expect(html).toMatch(/<meta[^>]*name="robots"[^>]*content="noindex,\s*follow"/i)
      expect(res.headers()['x-robots-tag']).toMatch(/^noindex,\s*follow$/i)
    })
  }
})

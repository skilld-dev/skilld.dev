import { expect, test } from './test-utils'

test.describe('multi-sitemap', () => {
  test('sitemap index lists all child sitemaps', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/sitemap_index.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()

    for (const name of ['pages', 'skills', 'people']) {
      expect(xml).toContain(`/__sitemap__/${name}.xml`)
    }
  })

  test('pages sitemap excludes dynamic routes', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/__sitemap__/pages.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()

    expect(xml).toContain('/accessibility')
    expect(xml).not.toMatch(/<loc>[^<]*\/skills\/[^<]+<\/loc>/)
    expect(xml).not.toMatch(/<loc>[^<]*\/people\/[^<]+<\/loc>/)
  })

  test('skills sitemap returns valid entries', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/__sitemap__/skills.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()

    expect(xml).toContain('<loc>')
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), m => new URL(m[1]!).pathname)
    expect(locs.length).toBeGreaterThan(0)
    for (const loc of locs) {
      expect(loc).toMatch(/^\/gh\//)
    }
  })

  test('people sitemap is valid and scoped to /people/', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/__sitemap__/people.xml`)
    expect(res.status()).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('<urlset')

    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), m => new URL(m[1]!).pathname)
    for (const loc of locs) {
      expect(loc).toMatch(/^\/people\//)
    }
  })
})

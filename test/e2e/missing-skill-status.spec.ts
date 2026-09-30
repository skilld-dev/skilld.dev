import { expect, test } from './test-utils'

const CANONICAL_HREF_RE = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/g

test.describe('missing Skill URL', () => {
  test('answers 404, noindex, and no canonical to another page', async ({ page, baseURL }) => {
    const path = '/gh/some-nonexistent-owner/repo/skill'
    const res = await page.request.get(`${baseURL}${path}`)
    expect(res.status()).toBe(404)
    const html = await res.text()
    expect(html).toContain('noindex,follow')
    expect(html).toContain('Skill not found')
    // The page itself sets no canonical. The SEO module still adds a self
    // canonical, which is harmless on a 404. Any other target is the old
    // bug: every made-up URL pointed Google at the homepage.
    const canonicals = [...html.matchAll(CANONICAL_HREF_RE)].map(match => match[1])
    for (const href of canonicals)
      expect(href).toBe(`https://skilld.dev${path}`)
  })
})

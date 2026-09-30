import { expect, test } from './test-utils'

test.describe('missing Skill URL', () => {
  test('answers 404, noindex, and no homepage canonical', async ({ page, baseURL }) => {
    const res = await page.request.get(`${baseURL}/gh/some-nonexistent-owner/repo/skill`)
    expect(res.status()).toBe(404)
    const html = await res.text()
    expect(html).toContain('noindex,follow')
    expect(html).not.toMatch(/<link rel="canonical"/)
    expect(html).toContain('Skill not found')
  })
})

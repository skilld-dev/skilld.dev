import { expect, test } from './test-utils'

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
const TITLE_RE = /<title>([^<]*)<\/title>/

// The file view titles itself from the route, so these hold whatever the local D1 holds.
test.describe('Skill file deep link', () => {
  for (const { file, title } of [
    { file: 'scripts/check_bounding_boxes.py', title: 'check_bounding_boxes.py · pdf' },
    { file: 'LICENSE.txt', title: 'LICENSE.txt · pdf' },
    // nuxt-ai-ready claims every `.md` URL as a page's Markdown twin.
    { file: 'reference.md', title: 'reference.md · pdf' },
  ]) {
    test(`opens the file view for /-/${file}`, async ({ request }) => {
      const response = await request.get(`/gh/anthropics/skills/pdf/-/${file}`, {
        headers: { 'accept': BROWSER_ACCEPT, 'sec-fetch-dest': 'document' },
      })

      expect(response.headers()['content-type']).toContain('text/html')
      expect((await response.text()).match(TITLE_RE)?.[1]).toContain(title)
    })
  }
})

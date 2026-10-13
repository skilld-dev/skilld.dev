import { expect, test } from './test-utils'

const LINK_RE = /\]\((https:\/\/skilld\.dev[^)\s]+)\)/g

test.describe('agent discovery', () => {
  test('the AI sitemap answers HEAD the way it answers GET', async ({ request, baseURL }) => {
    const head = await request.head(`${baseURL}/ai-sitemap.xml`)
    expect(head.status()).toBe(200)
    expect(head.headers()['content-type']).toContain('application/xml')
  })

  test('a login with no account and no Skills answers 404', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/@no-such-author-zz9`)
    expect(res.status()).toBe(404)
  })

  test('llms.txt is a small index, and every link in it and its nested files resolves', async ({ request, baseURL }) => {
    const local = (url: string) => url.replace('https://skilld.dev', baseURL!)
    const index = await request.get(`${baseURL}/llms.txt`)
    expect(index.status()).toBe(200)
    const text = await index.text()
    expect(text.length).toBeLessThan(100_000)
    expect(text).not.toContain('llms-full.txt')

    const nested = [...text.matchAll(LINK_RE)].map(match => match[1]!).filter(url => url.includes('/llms/'))
    const links = [...text.matchAll(LINK_RE)].map(match => match[1]!)
    for (const url of nested) {
      const res = await request.get(local(url))
      expect(res.status(), url).toBe(200)
      links.push(...[...(await res.text()).matchAll(LINK_RE)].map(match => match[1]!))
    }
    for (const url of new Set(links)) {
      const res = await request.get(local(url), { maxRedirects: 0 })
      expect(res.status(), url).toBe(200)
    }
  })
})

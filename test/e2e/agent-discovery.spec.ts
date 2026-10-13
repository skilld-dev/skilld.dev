import { expect, test } from './test-utils'

const LINK_RE = /\]\((https:\/\/skilld\.dev[^)\s]+)\)/g
const DISCOVERY_PATH_RE = /^\/llms\/[^/]+\.txt$/i

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
    expect(text.length).toBeLessThanOrEqual(80_000)
    expect(text).not.toContain('llms-full.txt')
    expect(text).toContain('https://skilld.dev/agent.md')
    expect(text).toContain('https://skilld.dev/.well-known/agent-skills/index.json')
    expect(text).toContain('https://skilld.dev/SKILL.md')
    expect(text).toContain('https://skilld.dev/.well-known/api-catalog')
    expect(text).toContain('https://skilld.dev/api/v1/openapi.json')
    expect(text).toContain('https://skilld.dev/ai-sitemap.xml')

    const visited = new Set<string>(['https://skilld.dev/llms.txt'])
    const links = new Set([...text.matchAll(LINK_RE)].map(match => match[1]!))
    const pending = [...links].filter(url => DISCOVERY_PATH_RE.test(new URL(url).pathname))
    while (pending.length) {
      const url = pending.shift()!
      if (visited.has(url))
        continue
      visited.add(url)
      const res = await request.get(local(url))
      expect(res.status(), url).toBe(200)
      const child = await res.text()
      expect(child.length, url).toBeLessThanOrEqual(80_000)
      expect(child, url).not.toContain('llms-full.txt')
      expect(child, url).not.toContain('/__sitemap__/retired')
      for (const match of child.matchAll(LINK_RE)) {
        const href = match[1]!
        links.add(href)
        if (DISCOVERY_PATH_RE.test(new URL(href).pathname))
          pending.push(href)
      }
      const head = await request.head(local(url))
      expect(head.status(), url).toBe(200)
      expect(head.headers()['content-type'], url).toContain('text/plain')
    }
    for (const url of links) {
      expect(new URL(url).pathname, url).not.toMatch(/^\/skills\/[^/]+\/[^/]+\/[^/]+$/)
      expect(new URL(url).pathname, url).not.toContain('/__sitemap__/retired')
      const res = await request.get(local(url), { maxRedirects: 0 })
      expect(res.status(), url).toBe(200)
    }
  })

  test('generated discovery files enforce their HTTP methods and unknown paths', async ({ request }) => {
    const head = await request.head('/llms.txt')
    expect(head.status()).toBe(200)
    expect(head.headers()['content-type']).toContain('text/plain')
    expect(await head.body()).toHaveLength(0)
    expect((await request.post('/llms.txt')).status()).toBe(405)
    expect((await request.get('/llms/missing-discovery-file.txt')).status()).toBe(404)
    const full = await request.get('/llms-full.txt', { maxRedirects: 0 })
    expect(full.status()).toBe(302)
    expect(full.headers().location).toBe('/llms.txt')
  })
})

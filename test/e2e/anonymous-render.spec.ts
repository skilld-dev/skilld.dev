import { expect, test } from './test-utils'

// Workers Cache answers a hit without running the Worker, and it does not
// bypass a request that carries a cookie. So a stored page reaches visitors
// whatever cookies they hold, and the server render must not depend on them.
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'

for (const path of ['/skills/trending', '/skills/trending?range=all', '/gh/antfu/skills']) {
  test(`${path} renders one HTML for every anonymous visitor`, async ({ request }) => {
    const headers = { accept: BROWSER_ACCEPT }
    const bare = await request.get(path, { headers })
    const withCookie = await request.get(path, { headers: { ...headers, cookie: 'theme=dark; _ga=GA1.1.1234' } })

    expect(bare.status()).toBe(200)
    expect(withCookie.status()).toBe(200)
    expect(await withCookie.text()).toBe(await bare.text())
    expect(bare.headers()['set-cookie']).toBeUndefined()
    expect(withCookie.headers()['set-cookie']).toBeUndefined()
    expect(bare.headers().vary).toBe('Accept, Sec-Fetch-Dest')
  })
}

test('the browser loads the session without being handed a cookie', async ({ request }) => {
  const response = await request.get('/api/_auth/session')

  expect(await response.json()).toEqual({})
  expect(response.headers()['set-cookie']).toBeUndefined()
})

test('an anonymous registry search sets no cookie', async ({ request }) => {
  const responses = await Promise.all([
    request.get('/api/skills?limit=2'),
    request.get('/api/skills/typeahead'),
  ])

  for (const response of responses) {
    expect(response.status()).toBe(200)
    expect(response.headers()['set-cookie']).toBeUndefined()
  }
})

test('an agent that asks for Markdown is sent to the .md page', async ({ request }) => {
  const response = await request.get('/skills/trending?range=week', {
    headers: { accept: 'text/markdown' },
    maxRedirects: 0,
  })

  expect(response.status()).toBe(307)
  expect(response.headers().location).toBe('/skills/trending.md')
  expect(response.headers().vary).toBe('Accept, Sec-Fetch-Dest')
})

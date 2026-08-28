import { expect, test } from './test-utils'

test('never caches repository indexing status', async ({ request }) => {
  const response = await request.get('/api/repos/index/not-a-job')

  expect(response.headers()['cloudflare-cdn-cache-control']).toBe('private, no-store')
})

test('never caches mutable repository views', async ({ request }) => {
  const responses = await Promise.all([
    request.get('/api/orgs/antfu'),
    request.get('/api/repos/antfu/skills/route-target'),
  ])

  for (const response of responses)
    expect(response.headers()['cloudflare-cdn-cache-control']).toBe('private, no-store')
})

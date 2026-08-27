import { expect, test } from './test-utils'

test('never caches repository indexing status', async ({ request }) => {
  const response = await request.get('/api/repos/index/not-a-job')

  expect(response.headers()['cloudflare-cdn-cache-control']).toBe('private, no-store')
})

import { describe, expect, it } from 'vitest'
import worker from '../src/index'

describe('artifact signer route', () => {
  it('does not expose a public root route', async () => {
    const response = await worker.fetch(new Request('https://artifact-signer.internal/'), undefined as never)

    expect(response.status).toBe(404)
  })
})

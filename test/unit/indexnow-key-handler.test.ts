import { describe, expect, it, vi } from 'vitest'
import { INDEXNOW_KEY } from '../../server/utils/indexnow'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
const headers: Record<string, string> = {}
vi.stubGlobal('setResponseHeader', (_event: unknown, name: string, value: string) => {
  headers[name] = value
})

describe('indexNow key handler', () => {
  it('answers the key as plain text', async () => {
    const { default: handler } = await import('../../server/handlers/indexnow-key')
    expect((handler as (event: unknown) => string)({})).toBe(INDEXNOW_KEY)
    expect(headers['content-type']).toContain('text/plain')
  })
})
